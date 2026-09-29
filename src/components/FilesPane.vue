<script setup lang="ts">
// The file explorer + editor itself, independent of where it is shown: the full-screen
// Files view (FilesOverlay) and the pane beside a zoomed grid cell mount the same thing.
// Left: a lazy-loaded directory tree rooted at `cwd`. Right: a CodeMirror editor, with a
// Markdown preview toggle that reuses the server's sandboxed md→HTML iframe. Writes go
// through PUT .../write, whose `path` the server contains within the project root.
//
// It owns no notion of routes or of being open — the host decides when it exists, and
// calls `reload()` after a root change it has already cleared with the user.
import { onBeforeUnmount, onMounted, ref, shallowRef, computed, nextTick, useTemplateRef, watch } from "vue";
import type { FilesPanelSeed } from "../composables/filesPanelSeed";
import { expandedPaths, restoreLevels } from "./filesTreeState";
import { useFilesTree, type TreeNode } from "../composables/useFilesTree";
import { useOpenFile } from "../composables/useOpenFile";
import { useFilesReveal } from "../composables/useFilesReveal";
import { useMdPreviewScroll } from "../composables/useMdPreviewScroll";
import type { FilesPaneState } from "./filesPaneState";
import { useFilesTabs } from "../composables/useFilesTabs";
import { tabLabels } from "./filesTabs";
import { nextTabIndex } from "./tabKeys";
import { previewLinkTarget } from "./previewLinkTarget";
import { filePreviewKind, isRasterImage } from "./filePreviewKind";
import { rawFileSrc } from "./filesPreviewSrc";
import FileFinder from "./FileFinder.vue";
import FileSearch from "./FileSearch.vue";
import { useFileSearchPanel } from "../composables/useFileSearchPanel";
import { useFileTreeWidth } from "../composables/useFileTreeWidth";
import { clippedNameTip } from "./fileTreeWidth";
import FilesToolbarButton from "./FilesToolbarButton.vue";
import { canOpenInCanvas, absoluteUnder, type StoriesRoots } from "../composables/canvasOpenFile";
import { filesRowActions, type FilesRowAction } from "./filesRowActions";
import { useFilesRowMenu } from "../composables/useFilesRowMenu";
import { askTheMachine } from "./filesPaneApi";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  cwd: string | null;
  requestedPath?: string | null;
  initialState?: FilesPaneState | null;
  canvasTarget?: boolean;
  // Whether there is a terminal beside this pane to insert a path into, and which directory it
  // is in. Two props rather than one: the pane can TRAIL that cell after a declined re-root, so
  // "there is a terminal" and "it is in my directory" are genuinely different questions.
  insertTarget?: boolean;
  insertTargetCwd?: string | null;
  // Where stories live, as one value: the workspace path alone cannot address a deck kept beside
  // its notes — that needs the id this server registered the subtree under (#1933).
  storiesRoots?: StoriesRoots;
}>();
const emit = defineEmits<{ close: []; dirty: [boolean]; "open-in-canvas": [path: string]; "insert-text": [text: string] }>();

// The tree is its own thing now (#2158): what has been read, what is expanded, what is on screen.
// The markup for it stays here.
const tree = useFilesTree(() => props.cwd);
// And so is the open file: the buffer, the editor it is shown in, the reader's place in it, and
// every way it is written back. Destructured because the template names these directly.
const file = useOpenFile(() => props.cwd);
const { openPath, openName, dirty, editSeq, saving, fileError, unpreviewable, conflict, showPreview, previewKind, previewSrc } = file;
// A PNG or JPEG: no text to edit, so the "not text" panel shows the picture itself (#2269).
const rasterSrc = computed(() => (openPath.value && isRasterImage(openPath.value) ? rawFileSrc(props.cwd, openPath.value, file.baseVersion.value) : null));
const { flush, save, overwrite, discardAndReload, openInOs } = file;
// Which files are open as tabs, and which is in front (#2267). Every open below goes through it, so
// a path that already has a tab is brought forward rather than opened twice.
const tabs = useFilesTabs(file);
const strip = tabs.strip;
// One tab is the pane as it always was — the header names the file. The strip is for two or more,
// and for a lone tab that is not on screen, which would otherwise have no control at all.
const showStrip = computed(() => strip.value.tabs.length > 1 || strip.value.tabs.some((tab) => tab.path !== openPath.value));
// The one tab in the Tab order: the front one, or the first when none is in front — a strip whose
// tabs are all -1 cannot be reached from the keyboard.
const focusablePath = computed(() => strip.value.activePath ?? strip.value.tabs[0]?.path ?? null);
const labels = computed(() => tabLabels(strip.value.tabs.map((tab) => tab.path)));
// Whether the Canvas has a View for the open file — the plugins' own gates decide, not an
// extension test here (see canvasOpenFile.ts).
// Gated on the path the CARD will carry, not the row's relative one: a cell whose directory has a
// dot segment (`~/.config/proj`) makes `p.html` pass here and the joined path fail the plugin's
// own guard, which is a button that does nothing when pressed.
const NO_ROOTS: StoriesRoots = { workspaces: [], roots: [] };
const storiesRoots = computed<StoriesRoots>(() => props.storiesRoots ?? NO_ROOTS);
const canvasOpenable = computed(() => canOpenInCanvas(openPath.value ? absoluteUnder(props.cwd, openPath.value) : null, storiesRoots.value));

const editorHost = ref<HTMLDivElement>();

// Preview is an iframe the pane cannot read into, so where the reader is in it arrives by message
// from the document's own reporter — and goes back the same way when that document reloads.
const previewFrame = useTemplateRef<HTMLIFrameElement>("previewFrame");
// The wire hears the frame only while a MARKDOWN document was put in it: that document's one script
// is the server's nonce'd reporter. An HTML page runs its own scripts and could ask the host to open
// a browser tab or another file (#2269 review), so while one is up the wire hears no frame at all.
// What this does NOT establish is which document is in the frame now — a Markdown file nobody
// sanitised can navigate its own frame elsewhere — and that is a separate, known gap.
useMdPreviewScroll(() => (previewKind.value === "markdown" ? previewFrame.value : null), file.previewScrollTop, openPreviewLink);

const opensDrawn = (pathRel: string): boolean => {
  const kind = filePreviewKind(pathRel);
  return kind === "html" || kind === "svg";
};

// A link clicked in the Preview (#2268), resolved against the document being read. It opens in a
// tab of its own, keeping the one it was clicked in; a Markdown file comes up in Preview, since
// that is where the reader was. A path above the root is refused where the click happened, rather
// than doing nothing.
function openPreviewLink(href: string): void {
  const docPath = openPath.value;
  if (!docPath) return;
  const target = previewLinkTarget(docPath, href);
  if (target.kind === "outside") fileError.value = `This link points outside this folder: ${href}`;
  else if (target.kind === "file") void tabs.open(target.path, true, { path: target.path, showPreview: true });
}

// The host guards its own navigation on this, so it has to hear every change.
watch(dirty, (value) => emit("dirty", value));

// The row menu: right-click a tree row (or Shift+F10 / the Menu key on it) to put its path at
// the terminal's cursor (#1859). Teleported and fixed-positioned for CockpitRowMenu's reason —
// the tree scrolls inside an overflow container, which would clip a panel left in place.
const rowMenuEl = useTemplateRef<HTMLElement>("rowMenuEl");
const insertTerminal = computed(() => (props.insertTarget ? { cwd: props.insertTargetCwd ?? null } : null));

/** What a row offers. Kept here rather than in the composable because it is the end that reads
 *  this pane's props. */
const rowActionsFor = (node: TreeNode): FilesRowAction[] =>
  filesRowActions({
    pathRel: node.path,
    // Decides the wording and what the file manager is asked to do: a folder is opened, a file
    // is selected inside its own (#2039).
    isDir: node.dir,
    cwd: props.cwd,
    terminal: insertTerminal.value,
    // The same pair the header's Canvas button is drawn from, so a row can never offer what that
    // button would refuse — `canvasTarget` is "there is a cell to put a Canvas beside" and the
    // overlay mount has none.
    canvas: props.canvasTarget ? { roots: storiesRoots.value } : null,
  });

/** What picking one does — the other end that belongs to this pane, because it emits. */
function runRowAction(action: FilesRowAction): void {
  // The Canvas entry carries the row's path, not text for the terminal — and it goes out on the
  // SAME emit as the header button, relative to the tree's root, so the receiver resolves it once.
  if (action.id === "open-canvas") emit("open-in-canvas", action.pathRel);
  else if (action.id === "open-tab") void tabs.open(action.pathRel, true);
  // Not an emit: nothing above this pane takes part. The browser cannot open a file manager, so
  // the local server does it (#2039) — through filesPaneApi, like every other request here.
  else if (action.id === "reveal") void file.reportFailure(askTheMachine("/api/files/reveal", action.pathAbs, `could not show ${action.pathAbs}`));
  else emit("insert-text", action.text);
}

const {
  menu: rowMenu,
  open: openRowMenu,
  onMenuNav,
  onRowKeydown,
  pick: pickRowAction,
} = useFilesRowMenu<TreeNode>({
  menuEl: rowMenuEl,
  actionsFor: rowActionsFor,
  run: runRowAction,
});

// Cmd/Ctrl+click asks for a tab of its own, as it asks a browser for one; a plain click replaces
// the front tab, as it replaced the one open file before tabs.
// The name as a tip only when the row cuts it off. Set on the row's own pointerover / focusin, which
// run before the document listeners that read `data-tip`, so the tip sees the width as it is now.
function tipIfClipped(name: string, event: Event): void {
  const row = event.currentTarget;
  if (!(row instanceof HTMLElement)) return;
  const tip = clippedNameTip(row.querySelector<HTMLElement>("[data-row-name]"), name);
  if (tip === null) row.removeAttribute("data-tip");
  else row.setAttribute("data-tip", tip);
}

async function openFile(node: TreeNode, event: MouseEvent): Promise<void> {
  if (node.dir) return tree.toggleDir(node);
  await tabs.open(node.path, event.metaKey || event.ctrlKey);
}

const stripEl = useTemplateRef<HTMLElement>("stripEl");

// Delete closes the focused tab, as the tab pattern suggests; the arrows move between tabs as they
// do in the collection chat strip. Focus goes to whichever tab is in front once the move settles,
// not the one asked for: a switch refused because the edits could not be saved leaves the old tab in
// front, and a closed tab's button is gone.
async function onTabKey(e: KeyboardEvent, index: number): Promise<void> {
  const tab = strip.value.tabs[index];
  const next = nextTabIndex(e.key, index, strip.value.tabs.length);
  const target = next === null ? undefined : strip.value.tabs[next];
  if (!tab || (e.key !== "Delete" && !target)) return;
  e.preventDefault();
  if (e.key === "Delete") await tabs.close(tab.path);
  else if (target) await tabs.open(target.path);
  await nextTick();
  focusAfterTabMove();
}

/** The front tab, or — once a close has left one tab and the strip is gone — the file the reader is
 *  now on: its editor, or the tree when the editor is not what is showing. Never nothing, which
 *  would drop a keyboard user on the page body. */
function focusAfterTabMove(): void {
  const front = strip.value.tabs.findIndex((entry) => entry.path === strip.value.activePath);
  const tab = stripEl.value?.querySelectorAll<HTMLElement>('[role="tab"]')[front];
  const editor = showPreview.value ? null : editorHost.value?.querySelector<HTMLElement>('[contenteditable="true"]');
  (tab ?? editor ?? treeEl.value?.querySelector<HTMLElement>("button"))?.focus();
}

const treeEl = useTemplateRef<HTMLElement>("treeEl");
const { treeWidth, treeMin, treeStyle, onSplitterDown: onTreeSplitterDown, onSplitterKey: onTreeSplitterKey } = useFileTreeWidth(treeEl);
// Revealing a path — opening it AND putting the tree on it — with the finder that asks for one
// (#2158). `started` is passed as a getter because `reload()` replaces that promise.
const {
  finderOpen,
  closeFinder,
  onFinderPick,
  revealPath,
  reset: resetReveal,
} = useFilesReveal({
  tree,
  treeEl,
  started: () => started,
  open: (pathRel) => tabs.open(pathRel),
  openPath,
});

// "Search in files" (#2140) — the finder's companion, and its own panel for the reason its own
// header says: the rows are a file heading with matching lines under it, not one row per path.
// The editor is passed as a GETTER because the pane replaces it when the host element remounts.
const search = useFileSearchPanel({ dirty, openPath, editSeq, editor: () => file.editor.value, revealPath });

// The text a panel opens on: the palette's `/` or `#`, or nothing. A new object every time, so the
// panel hears it even when it is already open, and a plain open replaces the last one's text.
const finderSeed = shallowRef<FilesPanelSeed>({ text: "" });
const searchSeed = shallowRef<FilesPanelSeed>({ text: "" });
function openFinder(query = ""): void {
  finderSeed.value = { text: query };
  finderOpen.value = true;
}
function openSearch(query = ""): void {
  searchSeed.value = { text: query };
  search.open.value = true;
}

async function requestClose(): Promise<void> {
  if (await flush()) emit("close");
}

// Bound to this pane's own subtree, not to window: with a pane open beside a terminal,
// a window-level ⌘S would save while the user is typing into the terminal.
function onKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void save();
  }
}

function teardown(): void {
  // Every generation, not only the file's: a read already in flight would otherwise land after the
  // re-root and adopt the OLD project's content into the new tree, because its own generation check
  // still passes (Codex on #2102). Invalidating ALL of them is what makes "the pane is being torn
  // down" stop the work, rather than each request's own successor — so all three say so here.
  resetReveal();
  file.teardown();
  tabs.reset();
  // And the search, for the finder's reason: the root is changing, and a panel left open goes on
  // showing the OLD project's matches. Clicking one then reveals that relative path under the NEW
  // root — opening a different file where the same path exists, and nothing where it does not.
  search.close();
  // The root is changing and nothing has been read for the new one — including the error, which
  // belonged to the root being left. The header's Reload button deliberately does NOT come through
  // here: that tree is still this root's, and swapping the result in beats replacing a correct tree
  // with "Loading…".
  tree.reset();
  // The element OUTLIVES the root — a re-root happens in place — so the scrollbar would still be
  // where the last directory left it, and a directory with nothing remembered would open
  // mid-scroll. `restore` puts a remembered offset back after this (Codex on #2156).
  if (treeEl.value) treeEl.value.scrollTop = 0;
}

// The current startup, so anything that needs the TREE can wait for it. The pane mounts with an
// unread `roots` and fills it from a request, and a reveal arriving in that window would find no
// ancestor to expand — it would open the file and leave the tree collapsed, which is the half of
// #2099 that the issue actually asked for ("ツリー側でもそのファイルの位置が分かると…"). The
// `files-find` shortcut makes that window reachable: it mounts the pane and opens the finder over
// it in the same breath (Codex on #2102).
let started: Promise<void> = Promise.resolve();

async function start(): Promise<void> {
  const reqIdAtStart = file.generation();
  await nextTick();
  if (editorHost.value) file.attach(editorHost.value);
  await tree.loadRoot();
  await restore(props.initialState ?? null, reqIdAtStart);
  // An explicitly requested path wins over whatever was remembered — it is the more recent
  // intent (a clicked path in terminal output).
  if (props.requestedPath) void tabs.open(props.requestedPath);
}

/** Put a remembered tree back: open its directories parents-first (each fetches its children),
 *  then the file that was open. Anything since deleted simply isn't found and is skipped.
 *  `reqIdAtStart` is the read generation at the beginning of start() — restore only
 *  opens the remembered file when no competing request arrived during THIS startup cycle. */
async function restore(state: FilesPaneState | null, reqIdAtStart: number): Promise<void> {
  if (!state) return;
  // One wait per DEPTH, not one per directory. A level can only be looked up once the level above
  // it has its children, so the levels stay sequential — but siblings within a level are
  // independent fetches into their own nodes, and awaiting them one at a time was the whole of the
  // delay this pane was reported for (#2148).
  for (const level of restoreLevels(state.expanded)) {
    await Promise.all(
      level.map(async (dirPath) => {
        const node = tree.findNode(dirPath);
        if (node?.dir && !node.expanded) await tree.toggleDir(node);
      }),
    );
  }
  await tabs.restore({ tabs: state.tabs, activePath: state.activePath }, () => file.generation() === reqIdAtStart);
  // Last, and only after a tick: the rows have to exist before there is anything to scroll past,
  // and the expansions above are what create them.
  if (state.treeScrollTop !== undefined) {
    await nextTick();
    if (treeEl.value) treeEl.value.scrollTop = state.treeScrollTop;
  }
}

// A second clicked path while the pane is already showing: nothing else changes, so
// without this the file would never open.
watch(
  () => props.requestedPath,
  (pathRel) => {
    if (pathRel) void tabs.open(pathRel);
  },
);

onMounted(() => {
  started = start();
});
onBeforeUnmount(teardown);

// `reload` is the host's way to say "the root changed and I have already cleared it with the
// user" — the pane never watches `cwd` itself, because reacting to it would discard a buffer
// the host may still be asking about.
defineExpose({
  /** Say why an action the pane STARTED could not finish — the Canvas open, whose refusal comes
   *  back from the server (#1941). Shown where the click happened, in the same place a failed save
   *  reports: a message the user has to go looking for is one they never read. */
  showError: (message: string) => {
    fileError.value = message;
  },
  /** What this pane looks like right now, for a host that will bring the user back here. */
  snapshot: (): FilesPaneState => ({
    ...tabs.current(),
    expanded: expandedPaths(tree.roots.value ?? []),
    treeScrollTop: treeEl.value?.scrollTop ?? 0,
  }),
  reload: async () => {
    teardown();
    started = start();
    await started;
  },
  /** Open the "find a file by name" panel (#2099). The host calls this for the `files-find`
   *  shortcut, which has to be able to open the pane first — so the entry point cannot live in
   *  the pane's own key handler, which only hears what is already inside it. */
  openFinder: (query = "") => {
    openFinder(query);
  },
  /** Open the "search in files" panel (#2140). Same shape as openFinder, and for the same reason:
   *  the `files-search` shortcut has to be able to open the pane first. */
  openSearch: (query = "") => {
    openSearch(query);
  },
  /** Open a file the host chose — a path clicked in terminal output (#910). Routed through the
   *  same load, which treats opening another file as leaving this one, so an unsaved buffer is
   *  flushed (or keeps the pane where it is) exactly as it would be from the tree. */
  // A page or an SVG comes up drawn: a path clicked in terminal output to a chart is asking to see
  // the chart. Markdown opens as it always has.
  openFile: (pathRel: string) => tabs.open(pathRel, false, opensDrawn(pathRel) ? { path: pathRel, showPreview: true } : undefined),
  /** The `files-tab-*` keys (#2267), reached from the grid like the finder's. */
  closeFrontTab: () => tabs.closeFront(),
  stepTab: (step: 1 | -1) => tabs.step(step),
  flush,
});
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-auto flex-col" @keydown="onKeydown">
    <header class="flex flex-none items-center gap-2.5 border-b border-border bg-panel px-4 py-2">
      <slot name="title" />
      <span class="flex-auto" />
      <span v-if="openPath && !showStrip" class="min-w-0 truncate font-mono text-[12px]" :class="dirty ? 'text-fg' : 'text-secondary'"
        >{{ openName }}<span v-if="dirty" class="ml-1 text-amber" :data-tip="t('tips.panes.unsaved')">●</span></span
      >
      <button
        v-if="openPath && previewKind && previewSrc"
        type="button"
        class="h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"
        :disabled="saving"
        @click="file.togglePreview()"
      >
        {{ showPreview ? "Edit" : "Preview" }}
      </button>
      <!-- Only where there is a cell to open it beside: this pane is also mounted full-screen by
           FilesOverlay, which has no enlarged terminal and so nothing to put a Canvas next to. -->
      <button
        v-if="canvasTarget && canvasOpenable"
        type="button"
        data-testid="files-canvas-btn"
        class="h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"
        :data-tip="t('tips.panes.openInCanvas')"
        @click="openPath && emit('open-in-canvas', openPath)"
      >
        Canvas
      </button>
      <button
        v-if="openPath"
        type="button"
        class="h-[26px] cursor-pointer rounded-md border border-accent bg-accent-bg px-2.5 py-1 text-[12px] text-on-accent enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"
        :disabled="!dirty || saving"
        @click="save"
      >
        {{ saving ? "Saving…" : "Save" }}
      </button>
      <!-- Each panel's only entrance that needs no configuration: neither `files-find` nor
           `files-search` has a default binding, so without these the features are invisible to
           anyone who has not written a keymap. -->
      <FilesToolbarButton icon="search" :label="t('tips.panes.findByName')" test-id="files-find-btn" opens-a-panel @click="openFinder()" />
      <FilesToolbarButton icon="manage_search" :label="t('tips.panes.searchInFiles')" test-id="files-search-btn" opens-a-panel @click="openSearch()" />
      <FilesToolbarButton icon="refresh" :label="t('tips.panes.reloadTree')" @click="tree.loadRoot" />
      <FilesToolbarButton icon="right_panel_close" :label="t('tips.panes.closeFiles')" @click="requestClose" />
    </header>
    <!-- The strip follows the collection chat's: a row under the header, small tabs, the front one
         in the selected colour. Each tab and its close button are siblings inside one pill, because a
         button cannot hold a button. -->
    <div
      v-if="showStrip"
      ref="stripEl"
      data-testid="files-tabs"
      role="tablist"
      class="flex flex-none items-center gap-1 overflow-x-auto border-b border-border px-2 py-1 font-sans text-[12px] text-dim"
      :aria-label="t('tips.panes.fileTabs')"
    >
      <div
        v-for="(tab, index) in strip.tabs"
        :key="tab.path"
        role="presentation"
        class="flex flex-none items-center rounded"
        :class="tab.path === strip.activePath ? 'bg-selected text-fg' : 'text-dim hover:text-fg'"
        @mousedown.middle.prevent
        @auxclick.middle="tabs.close(tab.path)"
      >
        <button
          type="button"
          role="tab"
          data-testid="files-tab"
          :data-path="tab.path"
          :aria-selected="tab.path === strip.activePath"
          :tabindex="tab.path === focusablePath ? 0 : -1"
          :data-tip="tab.path"
          class="flex cursor-pointer items-center gap-1 border-0 bg-transparent py-0.5 pl-2 pr-1 font-mono text-[12px] text-inherit"
          @click="tabs.open(tab.path)"
          @keydown="onTabKey($event, index)"
        >
          {{ labels[index]
          }}<span v-if="tab.path === openPath && dirty" class="text-amber"
            ><span aria-hidden="true">●</span><span class="sr-only">{{ t("tips.panes.unsaved") }}</span></span
          >
        </button>
        <button
          type="button"
          tabindex="-1"
          data-testid="files-tab-close"
          class="mr-0.5 flex cursor-pointer items-center rounded border-0 bg-transparent p-0 text-[13px] leading-none text-inherit hover:bg-hover"
          :data-tip="t('tips.panes.closeTab')"
          :aria-label="t('tips.panes.closeTabNamed', { name: labels[index] })"
          @click="tabs.close(tab.path)"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </div>
    <div class="flex min-h-0 flex-auto">
      <nav ref="treeEl" class="shrink-0 grow-0 overflow-auto py-1.5" :style="treeStyle()" :aria-label="t('tips.panes.fileTree')">
        <p v-if="tree.error.value" class="p-4 text-[13px] text-err">{{ tree.error.value }}</p>
        <p v-else-if="tree.roots.value === null" data-testid="files-tree-loading" class="p-4 text-[13px] text-muted">Loading…</p>
        <p v-else-if="tree.roots.value.length === 0" data-testid="files-tree-empty" class="p-4 text-[13px] text-muted">Empty directory.</p>
        <button
          v-for="{ node, depth } in tree.rows.value"
          :key="node.path"
          type="button"
          data-testid="files-row"
          :data-path="node.path"
          class="flex w-full cursor-pointer items-center gap-1 whitespace-nowrap border-0 bg-transparent px-2 py-[3px] text-left font-mono text-[12px]"
          :class="node.path === openPath ? 'bg-hover text-fg' : 'text-secondary hover:bg-hover hover:text-fg'"
          :style="{ paddingLeft: `${8 + depth * 14}px` }"
          @click="openFile(node, $event)"
          @pointerover="tipIfClipped(node.name, $event)"
          @focusin="tipIfClipped(node.name, $event)"
          @contextmenu="openRowMenu(node, $event)"
          @keydown="onRowKeydown(node, $event)"
        >
          <span class="w-3.5 flex-none text-dim">
            <span v-if="node.dir" class="material-symbols-outlined" aria-hidden="true">{{ node.expanded ? "expand_more" : "chevron_right" }}</span>
          </span>
          <span class="material-symbols-outlined flex-none" aria-hidden="true">{{ node.dir ? "folder" : "description" }}</span>
          <span class="truncate" data-row-name>{{ node.name }}</span>
        </button>
      </nav>
      <div
        data-testid="files-tree-splitter"
        class="w-[5px] flex-none cursor-col-resize bg-border hover:bg-accent focus-visible:bg-accent"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('tips.panes.fileTreeResize')"
        :aria-valuenow="treeWidth"
        :aria-valuemin="treeMin"
        tabindex="0"
        @pointerdown.prevent="onTreeSplitterDown"
        @keydown="onTreeSplitterKey"
      />
      <section class="relative flex min-w-0 flex-auto">
        <div
          v-if="conflict"
          role="alert"
          data-testid="files-conflict"
          class="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-amber bg-[var(--warn-bg-subtle)] px-4 py-2 text-[13px] text-warn"
        >
          <span class="material-symbols-outlined" aria-hidden="true">warning</span>
          <span class="flex-auto">This file changed on disk. Nothing was saved — your version is kept as a backup either way.</span>
          <button
            type="button"
            class="h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary hover:bg-hover hover:text-fg"
            @click="discardAndReload"
          >
            Reload (discard your edits)
          </button>
          <button
            type="button"
            class="h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary hover:bg-hover hover:text-fg"
            @click="overwrite"
          >
            Overwrite anyway
          </button>
        </div>
        <!-- `role="alert"`, like the conflict banner above it: every message here lands AFTER an
             action the user started (a save, a read, a Canvas open that the server refused), so a
             reader who is not looking at this pane learns nothing without a live region — which is
             the same dead-button silence #1941 removed for everyone else. -->
        <p v-if="fileError" role="alert" data-testid="files-error" class="p-4 text-[13px] text-err">{{ fileError }}</p>
        <p v-if="!openPath" class="m-auto p-4 text-[13px] text-muted">Select a file to view or edit.</p>
        <!-- Not text. The editor is hidden rather than shown empty: an empty buffer over a file
             that has content is an invitation to save, and saving is what destroyed it (#2038). -->
        <div v-else-if="unpreviewable" class="m-auto flex flex-col items-center gap-2 p-4 text-center" data-testid="files-unpreviewable">
          <img
            v-if="rasterSrc"
            :src="rasterSrc"
            :alt="openName"
            data-testid="files-image"
            class="max-h-[70vh] max-w-full rounded border border-border bg-[var(--bg-base)] object-contain"
          />
          <template v-else>
            <span class="material-symbols-outlined text-[28px] text-muted" aria-hidden="true">draft</span>
            <p class="text-[13px] text-muted">{{ unpreviewable }}</p>
          </template>
          <button
            type="button"
            class="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] text-fg hover:bg-hover"
            data-testid="files-open-in-os"
            @click="openInOs"
          >
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">open_in_new</span>
            Open in OS
          </button>
        </div>
        <!-- `allow-scripts` and deliberately NOT `allow-same-origin`: the document renders a `.md`
             nothing sanitised, so it stays opaque-origin forever, and the server's own CSP lets a
             single nonce'd script run in it — the one that reports where the reader is (#2157).
             The effective sandbox is the intersection of this attribute and that header, so the
             permission has to be spelled in both. -->
        <!-- The Markdown document is drawn in the app's colours (#2263); an HTML page or an SVG is
             not, and a page that sets no background expects the white a browser gives it — on the
             app's dark ground its default black text is unreadable. -->
        <!-- Keyed by WHO may speak in it, because `contentWindow` is the same object across a
             navigation: without a fresh frame, a page being replaced by a Markdown document could
             still post on the Markdown wire in the moment between the two (#2269 review). And a
             page is loaded only while it is being looked at — it runs its own scripts, which the
             Markdown document (the reporter is its only script) does not. -->
        <iframe
          v-show="openPath && !unpreviewable && showPreview"
          ref="previewFrame"
          :key="previewKind === 'markdown' ? 'markdown' : 'page'"
          class="flex-auto border-0"
          :class="previewKind === 'markdown' ? 'bg-[var(--bg-base)]' : 'bg-white'"
          :src="previewKind === 'markdown' || showPreview ? previewSrc : ''"
          sandbox="allow-scripts"
          :title="previewKind === 'markdown' ? t('tips.panes.markdownPreview') : t('tips.panes.filePreview')"
        />
        <div v-show="openPath && !unpreviewable && !showPreview" ref="editorHost" class="files-editor min-w-0 flex-auto overflow-hidden" />
      </section>
    </div>
    <FileFinder v-if="finderOpen" :cwd="cwd" :seed="finderSeed" @pick="onFinderPick" @close="closeFinder" />
    <FileSearch v-if="search.open.value" :cwd="cwd" :buffer="search.buffer.value" :seed="searchSeed" @pick="search.onPick" @close="search.close" />
    <Teleport to="body">
      <div
        v-if="rowMenu"
        ref="rowMenuEl"
        data-testid="files-row-menu"
        role="menu"
        class="fixed z-[60] min-w-[200px] rounded-lg border border-border bg-panel p-1.5 text-fg shadow-xl"
        :style="{ top: `${rowMenu.top}px`, left: `${rowMenu.left}px` }"
        @keydown="onMenuNav"
      >
        <button
          v-for="action in rowMenu.actions"
          :key="action.id"
          type="button"
          role="menuitem"
          :data-testid="`files-row-action-${action.id}`"
          class="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] text-secondary hover:bg-hover hover:text-fg"
          @click="pickRowAction(action)"
        >
          <span class="material-symbols-outlined text-[15px]" aria-hidden="true">{{ action.icon }}</span> {{ action.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
