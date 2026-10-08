import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { h, type VNode } from "vue";
import TerminalGrid from "../../../src/components/TerminalGrid.vue";
import type { Cell } from "../../../src/components/gridTabs.js";
import { mountRequests } from "../../helpers/mountRequests";
import { seedFilesPanel, takeFilesPanelSeed } from "../../../src/composables/filesPanelSeed";
import { isRecord } from "../../../common/isRecord";
import { requestGridCellAction } from "../../../src/composables/useGridCellAction";

const runsFilesActions = (vm: unknown): vm is { runFilesAction: (action: string) => Promise<void> } => isRecord(vm) && typeof vm.runFilesAction === "function";

// "Browse files in the app" in a cell's path menu (#1910). It reaches the grid as `open-files`,
// and the grid answers it the way it answers the unread-canvas chip: the pane lives beside an
// ENLARGED cell, so a tiled cell asking for it is asking to be enlarged too.
//
// The enlargement itself belongs to the parent — this component only asks — so what is pinned
// here is the ask, plus what the grid does with the files buffer on the way.

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

const flush = vi.fn(async () => undefined as boolean | undefined);
const openFinder = vi.fn();
const closeFrontTab = vi.fn();
const stepTab = vi.fn();
const insertSelection = vi.fn();

vi.mock("../../../src/components/TerminalCell.vue", () => ({
  default: {
    name: "TerminalCell",
    props: ["expanded", "rightPane", "canvasAvailable"],
    emits: ["toggle-expand", "open-files", "toggle-canvas", "open-canvas", "new-here", "session", "cwd", "close", "move", "status"],
    template: '<div class="stub-cell" />',
  },
}));
vi.mock("../../../src/components/CommandCell.vue", () => ({
  default: { name: "CommandCell", props: ["expanded", "command"], emits: ["toggle-expand", "close", "move", "status"], template: "<div />" },
}));
vi.mock("../../../src/components/LauncherCell.vue", () => ({
  default: { name: "LauncherCell", props: ["expanded", "launcher"], emits: ["toggle-expand", "close", "move", "status", "session"], template: "<div />" },
}));
// Stubbed so a pane opened by a cell action below is visible without its own history request.
vi.mock("../../../src/components/PromptsPane.vue", () => ({
  default: { name: "PromptsPane", template: '<div class="stub-prompts-pane" />' },
}));
vi.mock("../../../src/components/FilesPane.vue", () => ({
  default: {
    name: "FilesPane",
    props: ["cwd", "requestedPath", "initialState", "canvasTarget", "workspace"],
    emits: ["close", "dirty", "open-in-canvas"],
    setup: (_p: unknown, { expose, slots }: { expose: (e: Record<string, unknown>) => void; slots: { title?: () => VNode[] } }) => {
      expose({ flush, reload: () => {}, snapshot: () => ({ openPath: null, expanded: [] }), openFinder, closeFrontTab, stepTab, insertSelection });
      return () => h("div", { class: "stub-files-pane" }, slots.title?.());
    },
  },
}));

const cell = (uid: number, session: string, cwd: string): Cell => ({ uid, session, cwd });

// One list, so the grid's cells and the routes the guard will accept cannot drift apart.
const CELLS = [cell(1, "s1", "/work/a"), cell(2, "s2", "/work/b")];
// `?? []` rather than a cast: `Cell.session` is nullable, and a cell without one contributes no
// route — which is the right answer, not something to assert away. Same idiom as listSlots.
const SESSIONS = CELLS.flatMap((c) => c.session ?? []);

const requests = mountRequests(SESSIONS, { strict: true });

const sessionOf = (uid: number) => CELLS.find((c) => c.uid === uid)?.session ?? "";

const mountGrid = () => {
  requests.enlarge(sessionOf(1));
  return mount(TerminalGrid, {
    props: {
      cells: CELLS,
      expandedUid: 1,
      listRows: [],
      cancelUid: null,
      defaultCwd: "/work",
      presets: [],
      launchers: [],
      home: "/work",
      openSessionIds: [],
      openCwds: [],
      reorderable: false,
      listMode: true,
    },
    attachTo: document.body,
  });
};

type Grid = ReturnType<typeof mountGrid>;
const cells = (w: Grid) => w.findAllComponents({ name: "TerminalCell" });
const filesPane = (w: Grid) => w.findComponent({ name: "FilesPane" });

/** The parent honouring a `toggle-expand`, which is what puts the pane beside the new cell. */
const applyExpand = async (w: Grid, uid: number) => {
  // Before the props change, so a request issued during that flush is judged against the cell the
  // zoom is moving TO, and one for the cell it left is the stale request this is here to catch.
  requests.enlarge(sessionOf(uid));
  await w.setProps({ expandedUid: uid });
  await flushPromises();
};

describe("open-files from a cell's path menu", () => {
  beforeEach(() => {
    localStorage.clear();
    requests.install();
    flush.mockClear();
    flush.mockResolvedValue(undefined);
    openFinder.mockClear();
    // The zoom-flip watcher asks for the reduced-motion preference the moment `expandedUid`
    // moves, which is exactly what the tiled case here does.
    if (!window.matchMedia) {
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
    }
  });

  // Awaited first: a mount effect that fires late would otherwise be read before it has run, and
  // the check would pass for the request it exists to catch.
  afterEach(async () => {
    await flushPromises();
    requests.settled();
  });

  it("opens the pane on the enlarged cell without asking to enlarge again", async () => {
    const w = mountGrid();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();

    expect(w.emitted("toggle-expand")).toBeUndefined();
    expect(filesPane(w).exists()).toBe(true);
    expect(filesPane(w).props("cwd")).toBe("/work/a");
    w.unmount();
  });

  // The `files-find` shortcut (#2099). It has to work from a cell with NO pane open — that is the
  // request: "ファイルペインを開いていない状態でショートカットを押した場合は、いま見ているセルの
  // 作業ディレクトリを対象にファイルペインが開いて、そのまま検索できる".
  it("opens the pane on the enlarged cell and then the finder, from a grid with no pane up", async () => {
    const w = mountGrid();
    expect(filesPane(w).exists()).toBe(false);

    await (w.vm as unknown as { openFilesFinder: () => Promise<void> }).openFilesFinder();
    await flushPromises();

    expect(filesPane(w).exists()).toBe(true);
    expect(filesPane(w).props("cwd")).toBe("/work/a");
    expect(openFinder).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  // The palette's `/` (#2512): the grid takes the text before its first await, so the palette can
  // drop whatever is left the moment its call returns, and hands it to the pane's finder.
  it("takes the palette's text as the action starts and opens the finder on it", async () => {
    const w = mountGrid();
    if (!runsFilesActions(w.vm)) throw new Error("TerminalGrid exposes no runFilesAction");
    openFinder.mockClear();
    seedFilesPanel("files-find", "app");
    const running = w.vm.runFilesAction("files-find");
    expect(takeFilesPanelSeed("files-find")).toBe("");
    await running;
    await flushPromises();
    expect(openFinder).toHaveBeenCalledWith("app");
    w.unmount();
  });

  // The tab keys (#2267) act on a pane that is up, and unlike the finder they never open one.
  it("leaves the pane closed for a tab key, acting on nothing", async () => {
    const w = mountGrid();
    const grid = w.vm as unknown as { runFilesAction: (a: string) => Promise<void>; filesOpen: () => boolean };
    await grid.runFilesAction("files-tab-close");
    await grid.runFilesAction("files-tab-next");
    await flushPromises();

    expect(grid.filesOpen()).toBe(false);
    expect(filesPane(w).exists()).toBe(false);
    expect(closeFrontTab).not.toHaveBeenCalled();
    expect(stepTab).not.toHaveBeenCalled();
    w.unmount();
  });

  // #2575. Like the tab keys: there is no selection in a pane that was not up, so it opens nothing.
  it("hands files-insert-selection to the pane that is up, and does nothing without one", async () => {
    const w = mountGrid();
    const grid = w.vm as unknown as { runFilesAction: (a: string) => Promise<void>; filesOpen: () => boolean };
    insertSelection.mockClear();
    await grid.runFilesAction("files-insert-selection");
    await flushPromises();
    expect(grid.filesOpen()).toBe(false);
    expect(insertSelection).not.toHaveBeenCalled();

    cells(w)[0].vm.$emit("open-files");
    await flushPromises();
    await grid.runFilesAction("files-insert-selection");
    expect(insertSelection).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("hands each tab key to the pane that is up", async () => {
    const w = mountGrid();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();
    closeFrontTab.mockClear();
    stepTab.mockClear();
    const grid = w.vm as unknown as { runFilesAction: (a: string) => Promise<void>; filesOpen: () => boolean };

    expect(grid.filesOpen()).toBe(true);
    await grid.runFilesAction("files-tab-close");
    await grid.runFilesAction("files-tab-next");
    await grid.runFilesAction("files-tab-prev");

    expect(closeFrontTab).toHaveBeenCalledTimes(1);
    expect(stepTab.mock.calls).toEqual([[1], [-1]]);
    w.unmount();
  });

  it("just opens the finder when the pane is already up, leaving the pane where it is", async () => {
    const w = mountGrid();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();

    await (w.vm as unknown as { openFilesFinder: () => Promise<void> }).openFilesFinder();
    await flushPromises();

    expect(openFinder).toHaveBeenCalledTimes(1);
    expect(filesPane(w).props("cwd")).toBe("/work/a");
    w.unmount();
  });

  it("asks for the enlargement first when the cell is tiled, and lands the pane on THAT cell", async () => {
    const w = mountGrid();
    cells(w)[1].vm.$emit("open-files");
    await applyExpand(w, 2);

    expect(w.emitted("toggle-expand")).toEqual([[2]]);
    expect(filesPane(w).exists()).toBe(true);
    // Rooted at the cell that was asked for, not the one that was enlarged when it was pressed.
    expect(filesPane(w).props("cwd")).toBe("/work/b");
    w.unmount();
  });

  it("is not a toggle — pressing it again on a cell that already shows the pane keeps it open", async () => {
    const w = mountGrid();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();

    expect(filesPane(w).exists()).toBe(true);
    w.unmount();
  });

  it("does not flush a pane that is not moving", async () => {
    const w = mountGrid();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();
    flush.mockClear();

    cells(w)[0].vm.$emit("open-files");
    await flushPromises();

    // Nothing unmounts, so there is nothing to save — and a silent save nobody asked for is a
    // write to the user's file.
    expect(flush).not.toHaveBeenCalled();
    w.unmount();
  });

  it("flushes a files pane that another cell is taking, and stays put when that save fails", async () => {
    const w = mountGrid();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();

    flush.mockClear();
    flush.mockResolvedValue(false); // could be neither saved nor backed up
    cells(w)[1].vm.$emit("open-files");
    await flushPromises();

    expect(flush).toHaveBeenCalledTimes(1);
    // Refused: no enlargement asked for, and the pane keeps the cell and root it is on.
    expect(w.emitted("toggle-expand")).toBeUndefined();
    expect(filesPane(w).props("cwd")).toBe("/work/a");
    w.unmount();
  });
});

// A header button, a shortcut or a palette pick, through the runner the grid registers. On the
// enlarged cell a pane toggles the way the History / Tools menu does; on a tile it enlarges first,
// like `open-files`, because a toggle there would only record a wish and look dead.
describe("cell actions asked for by name (#2611, #2635)", () => {
  beforeEach(() => {
    localStorage.clear();
    requests.install();
    flush.mockClear();
    flush.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await flushPromises();
    requests.settled();
  });

  it("toggles the pane on the enlarged cell without asking to enlarge", async () => {
    const w = mountGrid();
    requestGridCellAction("cell-1", "pane-files");
    await flushPromises();
    expect(filesPane(w).props("cwd")).toBe("/work/a");

    requestGridCellAction("cell-1", "pane-files");
    await flushPromises();
    expect(filesPane(w).exists()).toBe(false);
    expect(w.emitted("toggle-expand")).toBeUndefined();
    w.unmount();
  });

  it("enlarges a tiled cell and opens the pane on THAT cell", async () => {
    const w = mountGrid();
    requestGridCellAction("cell-2", "pane-files");
    await applyExpand(w, 2);

    expect(w.emitted("toggle-expand")).toEqual([[2]]);
    expect(filesPane(w).props("cwd")).toBe("/work/b");
    w.unmount();
  });

  it("opens a non-files pane on a tiled cell too, replacing none on the way", async () => {
    const w = mountGrid();
    requestGridCellAction("cell-2", "pane-prompts");
    await applyExpand(w, 2);

    expect(w.emitted("toggle-expand")).toEqual([[2]]);
    expect(w.findComponent({ name: "PromptsPane" }).exists()).toBe(true);
    w.unmount();
  });

  // A collapsed zoom leaves the files pane mounted, hidden, on the cell it was on, so another pane
  // pressed on that same (now tiled) cell unmounts it: its buffer has to be saved first.
  it("flushes a files pane that another pane replaces on the same cell, and stays put when that fails", async () => {
    const w = mountGrid();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();
    requests.enlarge(null);
    await w.setProps({ expandedUid: null });
    await flushPromises();

    flush.mockClear();
    flush.mockResolvedValue(false);
    requestGridCellAction("cell-1", "pane-prompts");
    await flushPromises();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(w.emitted("toggle-expand")).toBeUndefined();
    expect(filesPane(w).exists()).toBe(true);
    w.unmount();
  });

  it("hands what needs the whole grid to GridView, naming the cell", async () => {
    const w = mountGrid();
    expect(requestGridCellAction("cell-2", "terminal-new-here")).toBe(true);
    expect(requestGridCellAction("cell-2", "terminal-close")).toBe(true);
    expect(w.emitted("cell-shortcut")).toEqual([
      [2, "terminal-new-here"],
      [2, "terminal-close"],
    ]);
    w.unmount();
  });

  it("enlarges by the cell's own event, and declines a move outside manual order", async () => {
    const w = mountGrid();
    expect(requestGridCellAction("cell-2", "zoom-toggle")).toBe(true);
    expect(w.emitted("toggle-expand")).toEqual([[2]]);
    expect(requestGridCellAction("cell-2", "terminal-move-next")).toBe(false);
    expect(w.emitted("move")).toBeUndefined();
    w.unmount();
  });

  it("answers nothing for a slot that is no grid cell, or once the grid is gone", async () => {
    const w = mountGrid();
    expect(requestGridCellAction("single", "pane-files")).toBe(false);
    w.unmount();
    expect(requestGridCellAction("cell-1", "pane-files")).toBe(false);
  });

  it("passes new-here up with the cell it was pressed on", async () => {
    const w = mountGrid();
    cells(w)[1].vm.$emit("new-here");
    await flushPromises();
    expect(w.emitted("new-here")).toEqual([[2]]);
    w.unmount();
  });
});
