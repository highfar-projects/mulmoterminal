import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { h, type VNode } from "vue";

// Where a path chosen in the files pane meets a terminal (#1859). The pane decides WHICH paths
// it may offer; this side decides WHICH TERMINAL gets one — and the two cells in play here are
// not always the same, which is the whole reason the pane is told a directory rather than
// assuming its own.

const inserted: { key: string; text: string }[] = [];
const flush = vi.fn(async () => undefined as boolean | undefined);
vi.mock("../../../src/composables/useTerminalConnections", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  insertText: (key: string, text: string) => inserted.push({ key, text }),
}));
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/TerminalCell.vue", () => ({
  default: {
    name: "TerminalCell",
    props: ["expanded", "rightPane"],
    emits: ["toggle-expand", "toggle-files", "open-files", "session", "cwd", "close", "move", "status"],
    template: '<div class="stub-cell" />',
  },
}));
vi.mock("../../../src/components/CommandCell.vue", () => ({
  default: { name: "CommandCell", props: ["expanded", "command"], emits: ["toggle-expand", "open-files", "close", "move", "status"], template: "<div />" },
}));
vi.mock("../../../src/components/LauncherCell.vue", () => ({
  default: { name: "LauncherCell", props: ["expanded", "launcher"], emits: ["toggle-expand", "close", "move", "status", "session"], template: "<div />" },
}));
vi.mock("../../../src/components/FilesPane.vue", () => ({
  default: {
    name: "FilesPane",
    props: ["cwd", "requestedPath", "initialState", "canvasTarget", "insertTarget", "insertTargetCwd", "workspace"],
    emits: ["close", "dirty", "open-in-canvas", "insert-text"],
    setup: (_p: unknown, { expose, slots }: { expose: (e: Record<string, unknown>) => void; slots: { title?: () => VNode[] } }) => {
      expose({ flush, reload: () => {}, snapshot: () => ({ openPath: null, expanded: [] }) });
      return () => h("div", { class: "stub-files-pane" }, slots.title?.());
    },
  },
}));

import TerminalGrid from "../../../src/components/TerminalGrid.vue";
import type { Cell } from "../../../src/components/gridTabs.js";

const cell = (uid: number, session: string, cwd: string): Cell => ({ uid, session, cwd });
const commandCell = (uid: number, cwd: string): Cell => ({ uid, session: null, cwd, command: { source: "script", index: 0, label: "build", cwd } });

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
const pane = (w: Grid) => w.findComponent({ name: "FilesPane" });

const openPaneOn = async (w: Grid, index: number) => {
  cells(w)[index].vm.$emit("open-files");
  await flushPromises();
};

describe("inserting a tree path into the terminal", () => {
  beforeEach(() => {
    localStorage.clear();
    inserted.length = 0;
    // An enlarged session makes the grid ask whether it has the drawing tools. Nothing here is
    // about that answer, but a spec must not reach a live API for it.
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ groups: [] }) })) as unknown as typeof fetch;
    flush.mockClear();
    flush.mockResolvedValue(undefined);
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

  it("types the pane's text into the enlarged cell's slot", async () => {
    const w = mountGrid();
    await openPaneOn(w, 0);
    pane(w).vm.$emit("insert-text", "src/index.ts ");
    await flushPromises();

    expect(inserted).toEqual([{ key: "cell-1", text: "src/index.ts " }]);
    w.unmount();
  });

  // The pane can only offer a RELATIVE path when its tree and the receiving terminal are the
  // same directory, and this prop is how it finds out. Passing the pane's own root instead would
  // make the answer always yes — including in the one case where it is wrong, below.
  it("tells the pane the ENLARGED cell's directory, not its own root", async () => {
    const w = mountGrid();
    await openPaneOn(w, 0);
    expect(pane(w).props("insertTarget")).toBe(true);
    expect(pane(w).props("cwd")).toBe("/work/a");
    expect(pane(w).props("insertTargetCwd")).toBe("/work/a");
    w.unmount();
  });

  // A command cell's terminal is handed no `persist-key`, so it is filed under `ephemeral-<uuid>`
  // and `cell-<uid>` names nothing. Offering the actions there would be two menu items that
  // silently do nothing (CodeRabbit, PR #1912).
  it("offers nothing to insert into a command cell", async () => {
    const w = mount(TerminalGrid, {
      props: {
        cells: [commandCell(1, "/work/a"), cell(2, "s2", "/work/b")],
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
    await flushPromises();
    w.findAllComponents({ name: "CommandCell" })[0].vm.$emit("open-files");
    await flushPromises();

    expect(pane(w).props("insertTarget")).toBe(false);
    // And the handler refuses too, so a stale menu cannot reach a slot that is not there.
    pane(w).vm.$emit("insert-text", "src ");
    await flushPromises();
    expect(inserted).toEqual([]);
    w.unmount();
  });

  // The two come apart exactly once: a buffer that could be neither saved nor backed up keeps
  // the pane on the cell it is on, while the zoom has already moved. The tree is then showing
  // one project and the terminal beside it is running in another — so `src/index.ts` from this
  // tree would resolve, over there, to a different file that exists.
  it("reports the two directories separately once a declined re-root pulls them apart", async () => {
    const w = mountGrid();
    await openPaneOn(w, 0);

    flush.mockResolvedValue(false); // neither saved nor banked
    await w.setProps({ expandedUid: 2 });
    await flushPromises();

    expect(pane(w).props("cwd")).toBe("/work/a"); // the tree stayed
    expect(pane(w).props("insertTargetCwd")).toBe("/work/b"); // the terminal did not
    w.unmount();
  });
});
