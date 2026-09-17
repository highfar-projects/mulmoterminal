<script setup lang="ts">
// The session's own conversation, read as turns rather than as the screen (#2112).
//
// A claude cell runs on the alternate screen, so the terminal holds no scrollback worth scrolling:
// what is above the fold is gone. This reads the agent's transcript instead — the same fold the
// phone gets (`server/session/transcript-view.ts`) — and pages BACKWARDS through it, so scrolling up
// walks the whole session to its first turn.
//
// A SNAPSHOT, deliberately: it does not follow a running turn. The terminal beside it is already the
// live view, and a pane that jumped while you were reading the part you scrolled back to find would
// be worse at the one job it has. The header carries a reload for when you want the newest again.
import { computed, nextTick, ref, watch } from "vue";
import { markdownSegments } from "../../common/codeBlocks";
import type { TranscriptRow, TranscriptTurn, TranscriptView } from "../../common/transcriptView";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const props = defineProps<{
  sessionId: string | null;
  cwd: string | null;
  // Whether this pane currently covers the terminal area. Owned by the grid, shown here because the
  // button that flips it lives in this header — the same contract Tools and Prompts have.
  expanded?: boolean;
}>();
const emit = defineEmits<{ close: []; toggleExpand: [] }>();

/** How close to the top counts as "show me older". A page is fetched before the reader reaches the
 *  very top, so the turns are there by the time they would have run out. */
const LOAD_OLDER_WITHIN_PX = 240;

const turns = ref<TranscriptTurn[]>([]);
/** Null until a page has been read. A status other than `ok` is the whole answer — each one is a
 *  different sentence, which is why the server sends four rather than a boolean. */
const status = ref<TranscriptView["status"] | null>(null);
/** The cursor for the page before the oldest one held, or null at the head of what can be read. */
const older = ref<string | null>(null);
const loading = ref(false);
const loadingOlder = ref(false);
const failed = ref(false);
const scroller = ref<HTMLElement | null>(null);

const isTranscriptRow = (value: unknown): value is TranscriptRow =>
  isRecord(value) &&
  typeof value.text === "string" &&
  (value.kind === "user" || value.kind === "assistant" || value.kind === "tool" || value.kind === "unknown");

// A turn with no readable row is dropped rather than rendered as an empty block. `at` is normalised
// instead: a turn is worth more than its clock, which is the same call the server makes.
const readTurn = (value: unknown): TranscriptTurn | null => {
  if (!isRecord(value) || !isUnknownArray(value.rows)) return null;
  const rows = value.rows.filter(isTranscriptRow);
  return rows.length === 0 ? null : { at: typeof value.at === "string" ? value.at : null, rows };
};

const readView = (body: unknown): { turns: TranscriptTurn[]; status: TranscriptView["status"]; older: string | null } | null => {
  if (!isRecord(body) || !isRecord(body.view) || typeof body.view.status !== "string") return null;
  const view = body.view;
  const rows = isUnknownArray(view.turns) ? view.turns.flatMap((turn) => readTurn(turn) ?? []) : [];
  const status = view.status;
  if (status !== "ok" && status !== "none" && status !== "cleared" && status !== "too-large" && status !== "not-supported") return null;
  return { turns: rows, status, older: typeof body.older === "string" ? body.older : null };
};

// Bumped per load, so a page for the cell you just walked away from cannot land in the one now
// enlarged — the same guard the prompts pane carries, and it matters more here: this pane appends.
let req = 0;

const url = (sessionId: string, before: string | null): string => {
  const params = new URLSearchParams({ session: sessionId });
  if (props.cwd) params.set("cwd", props.cwd);
  if (before !== null) params.set("before", before);
  return `/api/transcript/view?${params.toString()}`;
};

/** The newest page, replacing whatever is shown. */
async function load(): Promise<void> {
  const sessionId = props.sessionId;
  const my = ++req;
  turns.value = [];
  older.value = null;
  failed.value = false;
  status.value = null;
  // Cleared HERE, not only where it is set: an older-page fetch still in flight when the pane
  // follows the zoom to another cell fails its own `my === req` check and never reaches the
  // `finally` that would clear it. Left set, the new cell's pane never pages again — the same trap
  // the prompts pane documents for `loading` (CodeRabbit, #1749).
  loadingOlder.value = false;
  if (!sessionId) return;
  loading.value = true;
  try {
    const res = await fetchWithTimeout(url(sessionId, null));
    if (!res.ok) throw new Error(String(res.status));
    const page = readView(await jsonBody(res));
    if (my !== req) return; // superseded by a newer cell
    if (page === null) throw new Error("unreadable page");
    turns.value = page.turns;
    status.value = page.status;
    older.value = page.older;
    // The newest turn is at the BOTTOM, because the conversation reads downwards and that is where
    // a reader opening this pane expects to be — at the end of it, as the terminal would be.
    await nextTick();
    scrollToBottom();
  } catch {
    if (my === req) failed.value = true;
  } finally {
    if (my === req) loading.value = false;
  }
}

/** The page before the oldest turn held, prepended. */
async function loadOlder(): Promise<void> {
  const sessionId = props.sessionId;
  const cursor = older.value;
  if (!sessionId || cursor === null || loadingOlder.value || loading.value) return;
  const my = req;
  loadingOlder.value = true;
  try {
    const res = await fetchWithTimeout(url(sessionId, cursor));
    if (!res.ok) throw new Error(String(res.status));
    const page = readView(await jsonBody(res));
    if (my !== req) return; // the pane moved to another cell while this was in flight
    if (page === null) throw new Error("unreadable page");
    // Every non-`ok` status ends the walk: there is nothing older to show, and the turns already on
    // screen are still the right thing to be showing.
    older.value = page.status === "ok" ? page.older : null;
    if (page.turns.length > 0) await prepend(page.turns);
  } catch {
    if (my === req) older.value = null; // stop asking rather than retry on every scroll event
  } finally {
    if (my === req) loadingOlder.value = false;
  }
}

/** Put older turns above, and keep the reader where they were.
 *
 *  WITHOUT THE CORRECTION THE FEATURE DOES NOT WORK: content added above the viewport pushes
 *  everything down, so every page jumps the reader away from the line they were reading — which is
 *  precisely the line that made them scroll back. The height DIFFERENCE is the correction, taken
 *  across the DOM update. */
async function prepend(older: TranscriptTurn[]): Promise<void> {
  const el = scroller.value;
  const before = el?.scrollHeight ?? 0;
  const top = el?.scrollTop ?? 0;
  turns.value = [...older, ...turns.value];
  await nextTick();
  if (!el) return;
  el.scrollTop = top + (el.scrollHeight - before);
}

function scrollToBottom(): void {
  const el = scroller.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function onScroll(): void {
  const el = scroller.value;
  if (!el || older.value === null) return;
  if (el.scrollTop <= LOAD_OLDER_WITHIN_PX) void loadOlder();
}

// One watch over the identity: the pane stays mounted while the grid walks the zoom from cell to
// cell, so a changed session has to reload rather than keep another terminal's conversation.
watch([() => props.sessionId, () => props.cwd], () => void load(), { immediate: true });

/** What to say when there are no turns. Each status is its own sentence — "nothing here" and "this
 *  agent's conversation has no reader yet" send a reader to two different places. */
const emptyMessage = computed((): string => {
  if (failed.value) return "Couldn't read this session's conversation.";
  if (!props.sessionId) return "This cell hasn't started a session yet.";
  if (loading.value) return "Loading…";
  switch (status.value) {
    case "cleared":
      return "This conversation was ended with /clear. The next prompt starts a new one.";
    case "too-large":
      return "This transcript is too large to find a turn in.";
    case "not-supported":
      return "This agent keeps its conversation somewhere this pane can't read yet.";
    default:
      return "Nothing written to this session's transcript yet.";
  }
});

/** The label above a row. An `unknown` row gets none: it already says what it is, and naming a
 *  speaker for a block nobody could read would be inventing one. */
const SPEAKER_LABELS: Record<TranscriptRow["kind"], string> = { user: "You", assistant: "Agent", tool: "Tool", unknown: "" };
const speaker = (kind: TranscriptRow["kind"]): string => SPEAKER_LABELS[kind];

/** A turn's clock, as a reader places it: the time alone for today, with the date once it is older.
 *  An unparseable timestamp shows nothing rather than "Invalid Date". */
function formatAt(at: string | null): string {
  if (at === null) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() >= today.getTime() ? time : `${d.toLocaleDateString([], { month: "numeric", day: "numeric" })} ${time}`;
}

// Prose and fenced code, split — the pane's whole reason for existing over the terminal is that
// prose WRAPS at the pane's width in a reading font while code stays monospace and keeps its own
// line breaks. Inline markdown (`**bold**`) is left as the characters the agent wrote: rendering it
// would mean handing HTML to `v-html`, and what it would buy does not pay for that.
const segmentsOf = (text: string) => markdownSegments(text);
</script>

<template>
  <section class="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-deep">
    <div class="flex items-center justify-between bg-panel px-4 py-2 font-sans text-[14px] text-fg">
      <div class="flex items-baseline gap-2">
        <span class="font-semibold">Conversation</span>
        <span v-if="loadingOlder" class="text-[11px] text-dim">loading older…</span>
      </div>
      <!-- Reload, expand, close — expand and close in the order every other pane uses, since the
           three share one slot and the same control has to sit in the same place. -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          data-testid="transcript-reload-btn"
          class="cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-[15px] leading-none text-dim hover:text-fg"
          title="Read the conversation again, from the newest turn"
          aria-label="Reload the conversation"
          :disabled="loading"
          @click="void load()"
        >
          <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
        <button
          type="button"
          data-testid="transcript-expand-btn"
          class="cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-[15px] leading-none text-dim hover:text-fg"
          :title="expanded ? 'Restore the terminal beside the conversation' : 'Expand the conversation over the terminal'"
          :aria-label="expanded ? 'Restore conversation pane width' : 'Expand conversation pane'"
          :aria-pressed="expanded === true"
          @click="emit('toggleExpand')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{ expanded ? "close_fullscreen" : "open_in_full" }}</span>
        </button>
        <button
          type="button"
          data-testid="transcript-close-btn"
          class="cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-[15px] leading-none text-dim hover:text-fg"
          title="Close conversation pane"
          aria-label="Close conversation pane"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </div>
    <div ref="scroller" data-testid="transcript-scroll" class="flex-1 overflow-y-auto font-sans text-[13px] text-fg" @scroll="onScroll">
      <p v-if="turns.length === 0" data-testid="transcript-empty" class="px-4 py-6 text-center text-[12px] text-dim">{{ emptyMessage }}</p>
      <template v-else>
        <!-- Says which end is missing, and why it is not simply "scroll up": at the head of what can
             be read there is nothing more to fetch. -->
        <p v-if="older === null" class="px-4 py-2 text-center text-[11px] text-dim">The start of this conversation.</p>
        <p v-else class="px-4 py-2 text-center text-[11px] text-dim">Scroll up for older turns.</p>
        <ol class="m-0 list-none p-0">
          <li v-for="(turn, index) in turns" :key="index" data-testid="transcript-turn" class="border-b border-border px-3 py-2 last:border-b-0">
            <p v-if="formatAt(turn.at)" data-testid="transcript-time" class="m-0 text-[11px] tabular-nums text-dim">{{ formatAt(turn.at) }}</p>
            <div v-for="(row, rowIndex) in turn.rows" :key="rowIndex" data-testid="transcript-row" class="mt-1">
              <p v-if="speaker(row.kind)" class="m-0 text-[11px] font-semibold text-dim">{{ speaker(row.kind) }}</p>
              <!-- A tool row is output, not prose: monospace, and it scrolls sideways rather than
                   being re-wrapped into something that no longer reads as the tool printed it. -->
              <pre
                v-if="row.kind === 'tool'"
                data-testid="transcript-tool"
                class="m-0 overflow-x-auto whitespace-pre font-mono text-[11px] leading-[1.45] text-dim"
                >{{ row.text }}</pre>
              <template v-else>
                <template v-for="(segment, segIndex) in segmentsOf(row.text)" :key="segIndex">
                  <pre
                    v-if="segment.kind === 'code'"
                    data-testid="transcript-code"
                    class="my-1 overflow-x-auto whitespace-pre rounded bg-subtle p-2 font-mono text-[11px] leading-[1.45]"
                    >{{ segment.body }}</pre>
                  <p
                    v-else
                    data-testid="transcript-text"
                    class="m-0 select-text whitespace-pre-wrap break-words text-[12px] leading-[1.5]"
                    :class="row.kind === 'unknown' ? 'text-dim italic' : 'text-fg'"
                  >
                    {{ segment.text }}
                  </p>
                </template>
              </template>
              <p v-if="row.clipped" class="m-0 text-[11px] text-dim">…cut here</p>
            </div>
          </li>
        </ol>
      </template>
    </div>
  </section>
</template>
