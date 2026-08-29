import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { h, type VNode } from "vue";
import TerminalGrid from "../../../src/components/TerminalGrid.vue";
import type { Cell } from "../../../src/components/gridTabs.js";

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

vi.mock("../../../src/components/TerminalCell.vue", () => ({
  default: {
    name: "TerminalCell",
    props: ["expanded", "rightPane", "canvasAvailable"],
    emits: ["toggle-expand", "toggle-files", "open-files", "toggle-canvas", "open-canvas", "session", "cwd", "close", "move", "status"],
    template: '<div class="stub-cell" />',
  },
}));
vi.mock("../../../src/components/CommandCell.vue", () => ({
  default: { name: "CommandCell", props: ["expanded", "command"], emits: ["toggle-expand", "close", "move", "status"], template: "<div />" },
}));
vi.mock("../../../src/components/LauncherCell.vue", () => ({
  default: { name: "LauncherCell", props: ["expanded", "launcher"], emits: ["toggle-expand", "close", "move", "status", "session"], template: "<div />" },
}));
vi.mock("../../../src/components/FilesPane.vue", () => ({
  default: {
    name: "FilesPane",
    props: ["cwd", "requestedPath", "initialState", "canvasTarget", "workspace"],
    emits: ["close", "dirty", "open-in-canvas"],
    setup: (_p: unknown, { expose, slots }: { expose: (e: Record<string, unknown>) => void; slots: { title?: () => VNode[] } }) => {
      expose({ flush, reload: () => {}, snapshot: () => ({ openPath: null, expanded: [] }) });
      return () => h("div", { class: "stub-files-pane" }, slots.title?.());
    },
  },
}));

const cell = (uid: number, session: string, cwd: string): Cell => ({ uid, session, cwd });

// Mounting the grid on an enlarged SESSION sends three requests before anything in this file has
// happened: is a question open (`/api/question/<id>`), does it already have a card
// (`/api/agent/toolResults/<id>`), and what can it draw (`/api/tools`). Nothing here is about any
// of those answers — but unmocked they went out for real, failing only because a relative URL has
// no origin under jsdom, which is why the miss left nothing to notice. Each is answered as the
// quiet case, which is what these tests assume anyway.
//
// The throw is the point of listing them rather than answering `{}` to everything: a fourth
// request added to the mount is a spec that says so, instead of one that silently reaches out.
const mockApi = () => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/question/")) return { ok: true, json: async () => ({ question: null }) };
    if (url.includes("/api/agent/toolResults/")) return { ok: true, json: async () => ({ toolResults: [] }) };
    if (url.includes("/api/tools")) return { ok: true, json: async () => ({ groups: [] }) };
    throw new Error(`unmocked request: ${url}`);
  }) as unknown as typeof fetch;
};

const mountGrid = () =>
  mount(TerminalGrid, {
    props: {
      cells: [cell(1, "s1", "/work/a"), cell(2, "s2", "/work/b")],
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

type Grid = ReturnType<typeof mountGrid>;
const cells = (w: Grid) => w.findAllComponents({ name: "TerminalCell" });
const filesPane = (w: Grid) => w.findComponent({ name: "FilesPane" });

/** The parent honouring a `toggle-expand`, which is what puts the pane beside the new cell. */
const applyExpand = async (w: Grid, uid: number) => {
  await w.setProps({ expandedUid: uid });
  await flushPromises();
};

describe("open-files from a cell's path menu", () => {
  beforeEach(() => {
    localStorage.clear();
    mockApi();
    flush.mockClear();
    flush.mockResolvedValue(undefined);
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

  it("opens the pane on the enlarged cell without asking to enlarge again", async () => {
    const w = mountGrid();
    cells(w)[0].vm.$emit("open-files");
    await flushPromises();

    expect(w.emitted("toggle-expand")).toBeUndefined();
    expect(filesPane(w).exists()).toBe(true);
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
