<script setup lang="ts">
// Search the CONTENTS of the open directory (#2140) — the companion to FileFinder, which searches
// their names, and deliberately a SEPARATE component rather than a mode of it.
//
// They share a purpose and almost no mechanism. The finder fetches every path ONCE and filters in
// the browser on each keystroke; there is no version of this where the browser holds every file's
// text, so a search here is one server request per query, debounced, with the previous one aborted.
// The rows differ too: a file heading with its matching lines under it, not one row per path.
//
// The one file the disk cannot answer for is the one open in the editor with unsaved edits. Its
// disk matches are DISCARDED rather than merged in both modes — the two describe different
// documents, and a stale line number sends the jump to the wrong place. In literal mode the buffer
// is then searched here from its text; in regex mode it is not searched at all, because that means
// running an untrusted pattern on the thread that draws the UI, and the panel says so
// (common/fileSearch.ts carries the measurement).
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { groupByFile, isSearchable, withBufferMatches, type SearchMatch, type SearchRequest } from "../../common/fileSearch";
import { menuFocusMove } from "./filesRowActions";
import { isUnknownArray } from "../../common/isUnknownArray";
import { isRecord } from "../../common/isRecord";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../utils/fetchWithTimeout";

/** How long the panel waits after the last keystroke. Each query is a subprocess on the server, so
 *  this is not only about the network — typing "session" unthrottled would start seven greps. */
const DEBOUNCE_MS = 180;

/** The keys that move the selection. The same short list as the finder's, for the same reason: the
 *  keyboard is in a text field, where Home and End belong to the caret. */
const LIST_KEYS = ["ArrowUp", "ArrowDown"];

const props = defineProps<{
  cwd: string | null;
  /** The file open in the editor and its CURRENT text, when it has unsaved edits. Null when nothing
   *  is dirty — then the disk answer is complete on its own. */
  buffer: { path: string; text: string } | null;
}>();
const emit = defineEmits<{ pick: [pathRel: string, line: number]; close: [] }>();

const query = ref("");
const regex = ref(false);
const caseSensitive = ref(false);
const matches = ref<SearchMatch[]>([]);
const truncated = ref(false);
const ignoresGitignore = ref(false);
const searching = ref(false);
const searchError = ref<string | null>(null);
const active = ref(0);

const input = useTemplateRef<HTMLInputElement>("input");
const listEl = useTemplateRef<HTMLElement>("listEl");
const panel = useTemplateRef<HTMLElement>("panel");

const request = computed((): SearchRequest => ({ query: query.value, regex: regex.value, ...(caseSensitive.value ? { caseSensitive: true } : {}) }));

// The buffer is applied HERE rather than on the server, so it re-applies when the user edits while
// the panel is open without costing another search.
const resolved = computed(() => withBufferMatches(matches.value, props.buffer, request.value));
const groups = computed(() => groupByFile(resolved.value.matches));

/** Every match as one flat list, in the order the groups render them — what the arrows walk. The
 *  headings are not selectable: they are not somewhere to jump to. */
const rows = computed(() => groups.value.flatMap((group) => group.matches));

// Only the newest answer may be applied: searches overlap, and an older one describes a query the
// user has already moved past. The same guard the roster's seed carries (#620).
let latest = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: AbortController | null = null;

async function runSearch(): Promise<void> {
  const seed = ++latest;
  if (!isSearchable(query.value)) {
    matches.value = [];
    truncated.value = false;
    searchError.value = null;
    searching.value = false;
    return;
  }
  // The previous request is cancelled rather than left to land: it is a subprocess on the other
  // end, and its answer is about a query that no longer exists.
  inFlight?.abort();
  const abort = new AbortController();
  inFlight = abort;
  searching.value = true;
  searchError.value = null;
  try {
    const params = new URLSearchParams({ q: query.value });
    if (props.cwd) params.set("cwd", props.cwd);
    if (regex.value) params.set("regex", "1");
    if (caseSensitive.value) params.set("case", "1");
    // NOT the default deadline: the route shells out to `git grep`, whose own cap on the server is
    // 10s. With the default the browser would give up first on a large repository, every time.
    const res = await fetchWithTimeout(`/api/files/browse/search?${params.toString()}`, { signal: abort.signal }, SLOW_COMMAND_TIMEOUT_MS);
    const data = await jsonBody(res);
    if (seed !== latest) return;
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
    // Checked off the wire: a row is rendered and then OPENED, so a malformed entry would become a
    // row that jumps nowhere.
    matches.value = isUnknownArray(data.matches) ? data.matches.filter(isSearchMatch) : [];
    truncated.value = data.truncated === true;
    // Outside a repository there is no ignore file to apply. Saying so beats letting a reader
    // conclude their .gitignore is broken when node_modules appears.
    ignoresGitignore.value = data.source === "no-index";
  } catch (e) {
    if (abort.signal.aborted || seed !== latest) return; // superseded, not a failure to report
    searchError.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (seed === latest) searching.value = false;
  }
}

const isSearchMatch = (value: unknown): value is SearchMatch =>
  isRecord(value) && typeof value.path === "string" && typeof value.line === "number" && typeof value.text === "string";

// The QUERY and both modes decide the answer together — a mode toggled after typing has to re-ask,
// or the panel shows a literal search under a regex badge.
watch([query, regex, caseSensitive], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void runSearch(), DEBOUNCE_MS);
});

// Typing changes what is under the cursor, so the selection returns to the top and the list scrolls
// back with it — a narrowed list would otherwise open part-way down with its first row out of sight.
watch(rows, () => {
  if (active.value >= rows.value.length) active.value = 0;
});
watch(query, () => {
  active.value = 0;
  if (listEl.value) listEl.value.scrollTop = 0;
});

function pick(index: number): void {
  const chosen = rows.value[index];
  if (chosen) emit("pick", chosen.path, chosen.line);
}

/** Keep the selected row on screen. `nearest` rather than `center`, so the panel does not appear to
 *  move under the reader on every arrow press. */
watch(active, (index) => {
  listEl.value?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
});

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return; // an IME candidate list owns the arrows and Enter while composing
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    pick(active.value);
    return;
  }
  if (!LIST_KEYS.includes(event.key)) return;
  const to = menuFocusMove(event.key, active.value, rows.value.length);
  if (to === null) return;
  event.preventDefault();
  active.value = to;
}

// Clicking anywhere else is "not this after all". Pointerdown rather than click, so the pane
// underneath does not also act on the same gesture.
function onOutside(event: PointerEvent): void {
  const target = event.target instanceof Node ? event.target : null;
  if (!panel.value?.contains(target)) emit("close");
}

/** Where a match sits in the flat row list, so a click can select the same thing an arrow would. */
const rowIndexOf = (match: SearchMatch): number => rows.value.indexOf(match);

const isBufferPath = (path: string): boolean => props.buffer?.path === path;

onMounted(() => {
  input.value?.focus();
  window.addEventListener("pointerdown", onOutside);
});
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  inFlight?.abort();
  window.removeEventListener("pointerdown", onOutside);
});
</script>

<template>
  <div
    ref="panel"
    data-testid="file-search"
    class="absolute left-1/2 top-2 z-40 w-[min(620px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-panel shadow-xl"
    role="dialog"
    aria-label="Search in files"
    @keydown="onKeydown"
  >
    <div class="flex items-center gap-2 border-b border-border px-3 py-2">
      <span class="material-symbols-outlined flex-none text-[18px] text-dim" aria-hidden="true">search</span>
      <input
        ref="input"
        v-model="query"
        data-testid="file-search-input"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="file-search-list"
        aria-autocomplete="list"
        :aria-activedescendant="rows.length > 0 ? `file-search-row-${active}` : undefined"
        placeholder="Search in files"
        class="min-w-0 flex-auto border-0 bg-transparent font-mono text-[13px] text-fg outline-none placeholder:text-dim"
      />
      <!-- Both modes are shown as their own state rather than hidden in a menu: a search that
           silently means something other than what was typed is the thing to avoid. -->
      <button
        type="button"
        data-testid="file-search-case"
        class="h-[22px] flex-none cursor-pointer rounded border px-1.5 font-mono text-[11px]"
        :class="caseSensitive ? 'border-accent bg-hover text-accent' : 'border-border bg-transparent text-dim hover:text-fg'"
        :aria-pressed="caseSensitive"
        aria-label="Match case"
        title="Match case (otherwise a lower-case query matches either case)"
        @click="caseSensitive = !caseSensitive"
      >
        Aa
      </button>
      <button
        type="button"
        data-testid="file-search-regex"
        class="h-[22px] flex-none cursor-pointer rounded border px-1.5 font-mono text-[11px]"
        :class="regex ? 'border-accent bg-hover text-accent' : 'border-border bg-transparent text-dim hover:text-fg'"
        :aria-pressed="regex"
        aria-label="Regular expression"
        title="Regular expression"
        @click="regex = !regex"
      >
        .*
      </button>
      <button
        type="button"
        class="h-[22px] flex-none cursor-pointer rounded border-0 bg-transparent px-1 text-dim hover:text-fg"
        title="Close"
        aria-label="Close the search"
        @click="emit('close')"
      >
        <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
      </button>
    </div>

    <p v-if="searchError" role="alert" data-testid="file-search-error" class="px-3 py-2 text-[12px] text-err">{{ searchError }}</p>
    <p v-else-if="!isSearchable(query)" class="px-3 py-2 text-[12px] text-muted">Type to search the contents of this directory.</p>
    <p v-else-if="searching && rows.length === 0" class="px-3 py-2 text-[12px] text-muted">Searching…</p>
    <p v-else-if="rows.length === 0" data-testid="file-search-empty" class="px-3 py-2 text-[12px] text-muted">Nothing in this directory matches that.</p>

    <ul v-show="rows.length > 0" id="file-search-list" ref="listEl" role="listbox" class="max-h-[360px] overflow-auto py-1">
      <template v-for="group in groups" :key="group.path">
        <li class="flex items-baseline gap-2 px-3 pb-[1px] pt-1.5 font-mono text-[11px] text-dim" role="presentation">
          <span class="min-w-0 flex-auto truncate text-secondary">{{ group.path }}</span>
          <!-- The one file whose answer did not come from disk. Said out loud because its line
               numbers are the buffer's, and the file on disk still has the old ones. -->
          <span v-if="isBufferPath(group.path)" data-testid="file-search-unsaved" class="flex-none text-accent">unsaved</span>
          <span class="flex-none tabular-nums">{{ group.matches.length }}</span>
        </li>
        <li
          v-for="match in group.matches"
          :id="`file-search-row-${rowIndexOf(match)}`"
          :key="`${match.path}:${match.line}`"
          :data-index="rowIndexOf(match)"
          data-testid="file-search-row"
          role="option"
          :aria-selected="rowIndexOf(match) === active"
          class="flex cursor-pointer items-baseline gap-2 px-3 py-[2px] font-mono text-[12px]"
          :class="rowIndexOf(match) === active ? 'bg-hover text-fg' : 'text-secondary'"
          @pointerenter="active = rowIndexOf(match)"
          @click="pick(rowIndexOf(match))"
        >
          <span class="w-10 flex-none text-right text-[11px] tabular-nums text-dim">{{ match.line }}</span>
          <span class="min-w-0 truncate">{{ match.text }}<span v-if="match.clipped" class="text-dim"> …</span></span>
        </li>
      </template>
    </ul>

    <!-- Both notes are about what is NOT in the list. Silence here reads as "there is no such
         text", which is the one wrong answer a search can give. -->
    <!-- The open file was skipped, not searched-and-empty. Saying nothing would read as "there is
         nothing in that file", which is the one wrong answer a search can give — and the reader can
         act on this one by saving. -->
    <p v-if="resolved.bufferUnsearched" data-testid="file-search-buffer-skipped" class="border-t border-border px-3 py-1.5 text-[11px] text-muted">
      The file you are editing is not searched in regex mode — save it to include it.
    </p>
    <p v-if="truncated" data-testid="file-search-truncated" class="border-t border-border px-3 py-1.5 text-[11px] text-muted">
      This is not every match — narrow the search if what you want is missing.
    </p>
    <p v-if="ignoresGitignore" data-testid="file-search-unignored" class="border-t border-border px-3 py-1.5 text-[11px] text-muted">
      Not a git repository, so .gitignore is not applied.
    </p>
  </div>
</template>
