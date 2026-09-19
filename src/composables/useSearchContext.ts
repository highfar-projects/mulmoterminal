// The lines around the search result the reader is on (#2159).
//
// A result row is one line, which is often not enough to tell whether it is the one you want. The
// surrounding lines are read HERE rather than asked of `git grep -C`, and that is the whole design
// decision: under `-z` git stops distinguishing a matched line from a context line, and the field
// that would distinguish them can be forged by a text file carrying a NUL past git's binary sniff
// window — a context line then becomes a selectable result whose text is silently cut. The search
// parser stays untouched and the context comes from an ordinary read.
//
// Which also gives the one answer no on-disk read could: the file open in the editor with unsaved
// edits is answered from the BUFFER, with no request at all.
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { CONTEXT_RADIUS_LINES, lineWindow, type LineWindow, type WindowLine } from "../../common/fileSearch";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

/** Shorter than the search's own debounce: this is a local file read, not a subprocess, and the
 *  reader is holding an arrow key rather than typing. Long enough that walking a list does not
 *  start a request per row. */
const CONTEXT_DEBOUNCE_MS = 90;

/** What the reader is looking at. */
export interface SelectedResult {
  path: string;
  line: number;
}

export interface SearchContextDeps {
  cwd: Ref<string | null>;
  /** The open buffer and its CURRENT text, when it has unsaved edits — the one file whose
   *  surroundings are not on disk. Null when nothing is dirty. */
  buffer: Ref<{ path: string; text: string } | null>;
  selected: Ref<SelectedResult | null>;
}

export interface SearchContext {
  /** The lines around the selection, or null when there is nothing selected, the read has not
   *  landed, or it failed. */
  surrounding: ComputedRef<LineWindow | null>;
  /** Drop the pending read. The panel calls this when it goes away. */
  stop: () => void;
}

const isWindowLine = (value: unknown): value is WindowLine => isRecord(value) && typeof value.text === "string" && typeof value.clipped === "boolean";

/** Checked off the wire like every other answer this panel renders: these lines are drawn under a
 *  line NUMBER, so a malformed entry would put text on screen against a line that does not hold
 *  it. `{}` from an unreadable body fails here, which is what keeps it off the success path. */
const asLineWindow = (data: Record<string, unknown>): LineWindow | null => {
  if (typeof data.from !== "number" || !Number.isInteger(data.from) || !isUnknownArray(data.lines)) return null;
  return data.lines.every(isWindowLine) ? { from: data.from, lines: data.lines } : null;
};

export function useSearchContext(deps: SearchContextDeps): SearchContext {
  // The buffer answers for itself, synchronously, and re-answers on every edit — the reader is
  // looking at the file they are changing, so context a keystroke old is the wrong context.
  const fromBuffer = computed((): LineWindow | null => {
    const selected = deps.selected.value;
    const buffer = deps.buffer.value;
    if (!selected || buffer?.path !== selected.path) return null;
    return lineWindow(buffer.text, selected.line, CONTEXT_RADIUS_LINES);
  });

  /** What identifies a read. Null when there is nothing to read — no selection, or the buffer has
   *  already answered. A STRING so that a buffer edit, which rebuilds the buffer object on every
   *  keystroke, does not look like a new selection and start a request; `JSON.stringify` rather
   *  than a joined separator because a path may contain any byte but NUL, newlines included. */
  const diskKey = computed((): string | null => {
    const selected = deps.selected.value;
    if (!selected || deps.buffer.value?.path === selected.path) return null;
    return JSON.stringify([deps.cwd.value, selected.path, selected.line]);
  });

  // Stored WITH the key it answers, and rendered only while the two still agree. A bare ref would
  // leave the previous row's lines under the new selection for as long as the read takes, which is
  // the one thing a context block must never do: it reads as the surroundings of the line above it.
  //
  // It is also DROPPED on every key change, which the key check alone does not do. Leaving it made
  // a one-entry cache out of the last answer: going to another row and back showed that row's
  // previous surroundings again, under a line number whose file may have changed since — the exact
  // staleness this panel exists to avoid, and the opposite of the "read once per settled selection"
  // this composable claims (Codex, round 1; reproduced with a read that answers differently the
  // second time).
  const fromDisk = ref<{ key: string; window: LineWindow } | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: AbortController | null = null;

  /** Which generation of the selection a request belongs to. Bumped by the watch below on EVERY
   *  key change, so a request started before any movement can never be current again — even if the
   *  selection comes back to where it was.
   *
   *  This states what MAY be applied rather than listing what must be rejected, which is the shape
   *  the rule needed after a second staleness finding in two rounds. The first was about the stored
   *  answer, the second about the response still arriving; both are "an older answer won", and one
   *  counter closes the whole class instead of the two cases that were noticed.
   *
   *  It is the guard `runSearch` in FileSearch.vue already carries for the same reason (#620) — its
   *  absence here was the inconsistency. */
  let latest = 0;

  async function load(key: string, cwd: string | null, selected: SelectedResult): Promise<void> {
    const seed = latest;
    const abort = new AbortController();
    inFlight = abort;
    try {
      const params = new URLSearchParams({ path: selected.path, line: String(selected.line) });
      if (cwd) params.set("cwd", cwd);
      const res = await fetchWithTimeout(`/api/files/browse/lines?${params.toString()}`, { signal: abort.signal });
      const data = await jsonBody(res);
      // The GENERATION, not the key. A key comparison answers "is this the row we are on", which is
      // true again after leaving a row and returning to it — so an older request for that same row
      // passed it and overwrote a newer answer that had already landed (reproduced: the newer read
      // rendered, then the older one replaced it and stayed). Aborting the older request does not
      // settle it either: abort is not retroactive, and a body already resolved still runs its
      // continuation. Generation-current implies the key has not moved since, so this subsumes it.
      if (!res.ok || seed !== latest) return;
      const answered = asLineWindow(data);
      if (answered) fromDisk.value = { key, window: answered };
    } catch {
      // A peek that could not be read simply shows no peek. There is nothing to report: the result
      // row is unaffected and still opens, and an error banner here would be about a file the
      // reader has done no more than move the selection onto.
    }
  }

  watch(diskKey, (key) => {
    if (timer) clearTimeout(timer);
    inFlight?.abort();
    // Everything already in flight belongs to a generation that has passed, whatever it answers.
    latest += 1;
    fromDisk.value = null;
    if (key === null) return;
    const selected = deps.selected.value;
    const cwd = deps.cwd.value;
    if (!selected) return;
    timer = setTimeout(() => void load(key, cwd, selected), CONTEXT_DEBOUNCE_MS);
  });

  const surrounding = computed((): LineWindow | null => {
    if (fromBuffer.value) return fromBuffer.value;
    const disk = fromDisk.value;
    return disk && disk.key === diskKey.value ? disk.window : null;
  });

  return {
    surrounding,
    stop: () => {
      if (timer) clearTimeout(timer);
      inFlight?.abort();
    },
  };
}
