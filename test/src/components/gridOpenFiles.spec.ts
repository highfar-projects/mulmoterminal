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
const SESSIONS = CELLS.map((c) => c.session);

// Mounting the grid on an enlarged SESSION sends three requests before anything in this file has
// happened: is a question open (`/api/question/<id>`), does it already have a card
// (`/api/agent/toolResults/<id>`), and what can it draw (`/api/tools`). Nothing here is about any
// of those answers — but unmocked they went out for real, failing only because a relative URL has
// no origin under jsdom, which is why the miss left nothing to notice. Each is answered as the
// quiet case, which is what these tests assume anyway.
//
// Matched on the PARSED url, not on its text. Three review rounds found the same shape of hole in
// a text pattern — a path suffix (`/api/question/<id>/answer`, a real route in the same module),
// then a query string (`?extra=`), then any value at all for `sessionId` — because a pattern
// describes the characters it excludes instead of saying what a request IS. Said once here: this
// pathname, exactly these query keys, and a session THIS GRID ACTUALLY HAS. Anything else is a
// request the mount did not used to make, which is the one thing this list exists to notice.
// Codex iter-2 and iter-4, CodeRabbit iter-3, PR #1913.
//
// Codex asked for the session to be pinned to `s1`. Measured, that is wrong: one of these tests
// enlarges the SECOND cell, so `s2` is asked about too and pinning `s1` would fail the spec. The
// contract that holds is membership — which also rejects the empty `sessionId` that prompted it.
const lastSegment = (u: URL) => u.pathname.split("/").pop() ?? "";
const MOUNT_ROUTES: { path: RegExp; query: string[]; session: (u: URL) => string; body: () => unknown }[] = [
  { path: /^\/api\/question\/[^/]+$/, query: [], session: lastSegment, body: () => ({ question: null }) },
  { path: /^\/api\/agent\/toolResults\/[^/]+$/, query: [], session: lastSegment, body: () => ({ toolResults: [] }) },
  { path: /^\/api\/tools$/, query: ["sessionId"], session: (u) => u.searchParams.get("sessionId") ?? "", body: () => ({ groups: [] }) },
];

// The base is never used — every request here is relative — but `new URL` needs one to parse at
// all, and giving it a reserved TLD keeps a mistake from resolving to somewhere real.
const matchRoute = (url: string) => {
  const parsed = new URL(url, "https://spec.invalid");
  const keys = [...parsed.searchParams.keys()].join(",");
  return MOUNT_ROUTES.find((route) => route.path.test(parsed.pathname) && keys === route.query.join(",") && SESSIONS.includes(route.session(parsed)));
};

// A fourth request is caught because it is RECORDED here and asserted below. Throwing does not
// work: every mount-time caller catches its own fetch failure (fetchOpenQuestion, hasStoredCard,
// the tools watcher), so the rejection is swallowed and the spec passes knowing nothing about it.
// Both Codex and CodeRabbit caught that on PR #1913, against the first cut of this file.
const unexpected: string[] = [];
const mockApi = () => {
  unexpected.length = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = matchRoute(url);
    if (route) return { ok: true, json: async () => route.body() };
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
