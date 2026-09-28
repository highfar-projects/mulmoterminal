<script setup lang="ts">
// The path menu: click a cell's directory path for everything to do with that place — reveal it,
// insert a file path, browse it in the files pane, open a terminal there, and (when the remote is on
// GitHub or GitLab) its repository pages. Every cell type puts it on its path, so a file operation has ONE
// place to live whatever the cell runs.
//
// It acts on nothing it does not own: Browse files asks the GRID for the pane (only the grid knows
// where to put it), and failures are emitted for the host to show where it shows its own.
import { ref, nextTick, watch, onUnmounted, useTemplateRef } from "vue";
import { openTerminalAt } from "../composables/useNewTerminal";
import { pickFileInto } from "../composables/useHeaderAction";
import { menuPlacement, type MenuPlacement } from "../composables/menuPlacement";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import GithubIcon from "./GithubIcon.vue";
import { CELL_DIR_PATH, CELL_MENU_ITEM, DIR_TRUNCATE_FRONT } from "./cellChromeClasses";

const props = defineProps<{
  cwd: string | null;
  // What the trigger shows — the shortened path, or a worktree's label. Empty renders no trigger.
  label: string;
  // This cell's durable terminal slot: where Insert a file path types, and what New terminal here
  // opens beside. Null for a terminal nothing outside can address (a command cell's output), which
  // drops Insert — there is no prompt to type into — and appends the new terminal at the end.
  slotKey: string | null;
  // "lead" fills the rest of a row (the agent cell's row 2); "inline" is one item among others on a
  // row that also carries the command label (the command and launcher cells' row 1).
  layout: "lead" | "inline";
}>();
const emit = defineEmits<{
  (e: "open-files"): void;
  (e: "reveal-failed" | "insert-failed", message: string): void;
}>();

// Reveal the directory in the OS file manager. The browser can't open a folder, but the local
// server can (POST /api/open-dir).
async function openDir() {
  if (!props.cwd) return;
  try {
    const res = await fetchWithTimeout("/api/open-dir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: props.cwd }),
    });
    // A host with no file manager to call (a bare Linux box, WSL without interop) used to look
    // exactly like a successful reveal — the route said ok and nothing appeared (#1447).
    if (!res.ok) emit("reveal-failed", openDirFailureText(await jsonBody(res), res.status));
  } catch (e) {
    emit("reveal-failed", `Could not open the folder: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const openDirFailureText = (body: Record<string, unknown>, status: number): string =>
  typeof body.error === "string" && body.error.length > 0 ? body.error : `Could not open the folder (HTTP ${status}).`;

// When the directory is a GitHub repo, the server returns its repository URL (null otherwise) and
// the menu grows a section linking to the repo top page / Issues / Pull requests / Actions.
// Refreshed whenever the cwd changes (launch, server-confirmed cwd, restore).
const githubUrl = ref<string | null>(null);
const pathMenuOpen = ref(false);
const pathWrap = useTemplateRef<HTMLElement>("pathWrap");
let githubReq = 0; // request token: drop out-of-order responses (cwd can change fast)

async function refreshGithubUrl() {
  pathMenuOpen.value = false;
  const reqId = ++githubReq;
  if (!props.cwd) {
    githubUrl.value = null;
    return;
  }
  try {
    const res = await fetchWithTimeout(
      "/api/git-remote",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: props.cwd }),
      },
      SLOW_COMMAND_TIMEOUT_MS,
    );
    if (reqId !== githubReq) return; // a newer cwd superseded this lookup
    const data = res.ok ? await jsonBody(res) : {};
    if (reqId !== githubReq) return; // re-check after awaiting the body
    githubUrl.value = typeof data.githubUrl === "string" ? data.githubUrl : null;
  } catch {
    if (reqId === githubReq) githubUrl.value = null; // best-effort — the link just won't appear
  }
}
watch(() => props.cwd, refreshGithubUrl, { immediate: true });

// Repository top page (""), Issues, Pull requests or Actions — opened in a new tab.
function openGithub(suffix: string) {
  if (!githubUrl.value) return;
  window.open(githubUrl.value + suffix, "_blank", "noopener,noreferrer");
}

// `newTerminalHere` and `insertFilePath` go through the same helpers the header buttons dispatch to
// (useHeaderAction), so the menu and a user's own configured button cannot drift apart.
//
// Files asks the GRID for the pane beside this cell (#1910), which is somewhere only the grid can put
// it. A user's own `open.files` button still opens the full-screen view, and has to — it carries an
// arbitrary path, while the pane can only ever be rooted at the enlarged cell.
function browseFiles() {
  emit("open-files");
}
function newTerminalHere() {
  if (props.cwd) openTerminalAt(props.cwd, props.slotKey);
}
function insertFilePath() {
  if (props.slotKey) void pickFileInto(props.slotKey, (message) => emit("insert-failed", message));
}

// The shared menu row plus this menu's own layout: every item leads with an icon, so the labels
// line up and each destination is told apart by glyph the way they were as buttons.
const PATH_MENU_ITEM = `inline-flex items-center gap-2 whitespace-nowrap ${CELL_MENU_ITEM}`;
const WRAP_LAYOUT = { lead: "flex-auto", inline: "max-w-[45%] flex-initial" } as const;

// Closing puts focus back where it came from. The trigger is the only thing in this wrapper that
// survives the close, and leaving focus on a removed menu item drops the keyboard to the top of the
// document — which is why Escape has to do more than flip the flag.
const pathTrigger = useTemplateRef<HTMLElement>("pathTrigger");
function closePathMenu() {
  if (!pathMenuOpen.value) return;
  pathMenuOpen.value = false;
  void nextTick(() => pathTrigger.value?.focus());
}

// Every item closes the menu, so no item has to remember to.
function pathMenuAction(run: () => void) {
  closePathMenu();
  run();
}

// The CELL clips this menu, not just the window — the cell root is `overflow-hidden`, so a menu
// longer than the room under the header is cut off there however much screen is left below. That is
// why the arithmetic the ask menu uses (#2003) is fed the cell's box here rather than the window's.
// Measured in Chromium against the built stylesheet: a row costs 27px, the menu's border box went
// from 181px at six rows to 208px at seven, and the last row stops being hittable below a cell
// height of 217px at six rows but 244px at seven — a band a 3x3 tile lands in on an ~800px window.
const pathMenuUp = ref(false);
const pathMenuMaxH = ref<number | null>(null);

// Null when there is nothing to measure against (not laid out yet, or jsdom): the menu is then left
// unbounded, which is what it was before there was any cap at all.
function pathMenuPlacement(): MenuPlacement | null {
  const wrap = pathWrap.value;
  const cell = wrap?.closest(".cell");
  if (!wrap || !cell) return null;
  // Whichever edge comes first does the clipping — the cell's or the window's — so the box to fit
  // inside is the INTERSECTION. Cell alone would over-promise on a cell hanging below the fold;
  // window alone is what leaves the tiled cell's own overflow unaccounted for (codex on #2048).
  const box = cell.getBoundingClientRect();
  const top = Math.max(box.top, 0);
  const bottom = Math.min(box.bottom, window.innerHeight);
  // A box with no height is not a small box, it is an absent measurement — a cell mid-teleport, or
  // jsdom. Capping to it would render `max-height: 0` and hide the menu outright, which is a worse
  // failure than the clipping the cap exists to prevent, so this is the null path too.
  if (bottom <= top) return null;
  const rect = wrap.getBoundingClientRect();
  return menuPlacement({ top: rect.top - top, bottom: rect.bottom - top }, bottom - top);
}

function applyPathMenuPlacement() {
  const placement = pathMenuPlacement();
  pathMenuUp.value = placement?.up ?? false;
  pathMenuMaxH.value = placement?.maxHeightPx ?? null;
}

function togglePathMenu() {
  pathMenuOpen.value = !pathMenuOpen.value;
  if (pathMenuOpen.value) applyPathMenuPlacement();
}

// A cap is only true for the box it was measured in, and this menu outlives the things that change
// it: the window can shrink under it, the cell can (another tile arrives, the grid re-pages) with no
// window event at all, and a scroll moves both rectangles while resizing neither. All three are
// watched while it is open and released on close, so a shut menu costs nothing.
let pathMenuBox: ResizeObserver | null = null;

function watchPathMenuBox(open: boolean) {
  pathMenuBox?.disconnect();
  pathMenuBox = null;
  window.removeEventListener("resize", applyPathMenuPlacement);
  // Capture, so a scroll inside any ancestor reaches this: scrolling moves both rectangles without
  // resizing anything, so neither of the other two watchers fires (codex on #2048).
  window.removeEventListener("scroll", applyPathMenuPlacement, true);
  if (!open) return;
  window.addEventListener("resize", applyPathMenuPlacement);
  window.addEventListener("scroll", applyPathMenuPlacement, true);
  const cell = pathWrap.value?.closest(".cell");
  // jsdom and older embedders have no ResizeObserver; the window listener above still fires there.
  if (!cell || typeof ResizeObserver === "undefined") return;
  pathMenuBox = new ResizeObserver(applyPathMenuPlacement);
  pathMenuBox.observe(cell);
}

function onPathOutside(e: MouseEvent) {
  if (pathWrap.value && !(e.target instanceof Node && pathWrap.value.contains(e.target))) pathMenuOpen.value = false;
}
watch(pathMenuOpen, (open) => {
  if (open) document.addEventListener("mousedown", onPathOutside);
  else document.removeEventListener("mousedown", onPathOutside);
  watchPathMenuBox(open);
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onPathOutside);
  watchPathMenuBox(false);
});
</script>

<template>
  <!-- Escape is bound on the WRAPPER, not on the menu. Opening the menu leaves focus on the trigger
     button, so a handler on the menu itself only fires if something inside it happens to be
     focused — which, in the ordinary flow of clicking the path and changing your mind, is nothing.
     Keydown bubbles from the trigger to here, so this closes it from wherever focus actually is. -->
  <span ref="pathWrap" class="relative flex min-w-0 items-center" :class="WRAP_LAYOUT[layout]" @keydown.escape="closePathMenu">
    <button
      v-if="label"
      ref="pathTrigger"
      type="button"
      data-testid="cell-dir"
      class="cell-dir flex min-w-0 cursor-pointer items-center gap-0.5 border-none bg-transparent p-0 font-mono text-[11px] text-[var(--cell-header-fg,var(--text-dim))] hover:text-muted"
      :data-tip="cwd ?? ''"
      aria-haspopup="true"
      :aria-expanded="pathMenuOpen"
      @click="togglePathMenu"
    >
      <span class="min-w-0" :class="DIR_TRUNCATE_FRONT"
        ><span class="cell-dir-path" :class="CELL_DIR_PATH">{{ label }}</span></span
      >
      <!-- The path never showed that it was pressable — it opened a folder on click with nothing but
         a hover underline to say so. Now that a click costs a menu, the caret has to be there. -->
      <span class="material-symbols-outlined flex-none text-[14px]" aria-hidden="true">arrow_drop_down</span>
    </button>
    <div
      v-if="pathMenuOpen"
      data-testid="cell-path-menu"
      class="absolute left-0 z-20 flex min-w-[190px] flex-col overflow-y-auto rounded-md border border-border bg-panel p-1 shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
      :class="pathMenuUp ? 'bottom-full mb-1' : 'top-full mt-1'"
      :style="pathMenuMaxH === null ? undefined : { maxHeight: `${pathMenuMaxH}px` }"
    >
      <!-- Reveal stays first so the one gesture that already existed — click the path, get the
         folder — is still the shortest. -->
      <button type="button" data-testid="cell-path-item" :class="PATH_MENU_ITEM" @click="pathMenuAction(openDir)">
        <span class="material-symbols-outlined text-[15px]" aria-hidden="true">folder</span> Reveal in the file manager
      </button>
      <button v-if="slotKey" type="button" data-testid="cell-path-item" :class="PATH_MENU_ITEM" @click="pathMenuAction(insertFilePath)">
        <span class="material-symbols-outlined text-[15px]" aria-hidden="true">attach_file</span> Insert a file path
      </button>
      <button type="button" data-testid="cell-path-item" :class="PATH_MENU_ITEM" @click="pathMenuAction(browseFiles)">
        <span class="material-symbols-outlined text-[15px]" aria-hidden="true">folder_open</span> Browse files in the app
      </button>
      <button type="button" data-testid="cell-path-item" :class="PATH_MENU_ITEM" @click="pathMenuAction(newTerminalHere)">
        <span class="material-symbols-outlined text-[15px]" aria-hidden="true">terminal</span> New terminal here
      </button>
      <!-- GitHub only when the remote resolves to one, so this never offers a broken link. -->
      <template v-if="githubUrl">
        <span class="my-1 h-px flex-none bg-border" aria-hidden="true" />
        <button type="button" data-testid="cell-path-item" :class="PATH_MENU_ITEM" @click="pathMenuAction(() => openGithub(''))">
          <GithubIcon name="repo" class="m-px text-[13px]" /> Repository
        </button>
        <button type="button" data-testid="cell-path-item" :class="PATH_MENU_ITEM" @click="pathMenuAction(() => openGithub('/issues'))">
          <GithubIcon name="issue-opened" class="m-px text-[13px]" /> Issues
        </button>
        <button type="button" data-testid="cell-path-item" :class="PATH_MENU_ITEM" @click="pathMenuAction(() => openGithub('/pulls'))">
          <GithubIcon name="git-pull-request" class="m-px text-[13px]" /> Pull requests
        </button>
        <button type="button" data-testid="cell-path-item" :class="PATH_MENU_ITEM" @click="pathMenuAction(() => openGithub('/actions'))">
          <GithubIcon name="play" class="m-px text-[13px]" /> Actions
        </button>
      </template>
    </div>
  </span>
</template>
