import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// One list, so the grid's cells and the routes the guard will accept cannot drift apart.
const CELLS = [cell(1, "s1", "/work/a"), cell(2, "s2", "/work/b")];
// `?? []` rather than a cast: `Cell.session` is nullable, and a cell without one contributes no
// route — which is the right answer, not something to assert away. Same idiom as listSlots.
const SESSIONS = CELLS.flatMap((c) => c.session ?? []);

// Mounting the grid on an enlarged SESSION sends three requests before anything in this file has
// happened: is a question open, does it already have a card, and what can it draw. Nothing here is
// about any of those answers — but unmocked they went out for real, failing only because a
// relative URL has no origin under jsdom, which is why the miss left nothing to notice. Each is
// answered as the quiet case, which is what these tests assume anyway.
//
// Written as a literal SET rather than a pattern. A pattern says what a request may not contain,
// and every character class left something in that nobody meant — a path suffix, a query suffix,
// any value for the session, any origin. The set is six strings and it IS the list the mount
// makes, so anything else is a change by construction — the only question this guard asks.
//
// Built with the `encodeURIComponent` the three callers use, so it stays right for a session id
// that is not two plain characters.
const ALLOWED = new Map<string, () => unknown>(
  SESSIONS.flatMap((id): [string, () => unknown][] => [
    [`/api/question/${encodeURIComponent(id)}`, () => ({ question: null })],
    [`/api/agent/toolResults/${encodeURIComponent(id)}`, () => ({ toolResults: [] })],
    [`/api/tools?sessionId=${encodeURIComponent(id)}`, () => ({ groups: [] })],
  ]),
);

// A new request is caught because it is RECORDED here and asserted after every test. Throwing
// does not work: every mount-time caller catches its own fetch failure (fetchOpenQuestion,
// hasStoredCard, the tools watcher), so the rejection would be swallowed and the spec would pass
// knowing nothing about it.
const unexpected: string[] = [];
const mockApi = () => {
  unexpected.length = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = ALLOWED.get(url);
    if (body) return { ok: true, json: async () => body() };
    unexpected.push(url);
    return { ok: false, status: 500, json: async () => ({}) }; // the caller's own failure path, which it handles
  }) as unknown as typeof fetch;
};

const mountGrid = () =>
  mount(TerminalGrid, {
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

  // Awaited first: a mount effect that fires late would otherwise be read before it has run, and
  // the check would pass for the request it exists to catch.
  afterEach(async () => {
    await flushPromises();
    expect(unexpected).toEqual([]);
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
