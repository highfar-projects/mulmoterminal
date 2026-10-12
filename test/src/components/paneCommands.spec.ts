import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { h, type VNode } from "vue";
import TerminalGrid from "../../../src/components/TerminalGrid.vue";
import type { Cell } from "../../../src/components/gridTabs.js";

// #3022. An agent's `showInPane` / `requestCheck` reach the grid on one channel, carrying the session
// they are for. The enlarged cell acts at once; any other cell keeps the command until it is enlarged,
// so a background agent never takes the screen.
const bus = vi.hoisted(() => new Map<string, Set<(data: unknown) => void>>());
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({
    subscribe: (channel: string, cb: (data: unknown) => void) => {
      const entry = bus.get(channel) ?? new Set<(data: unknown) => void>();
      entry.add(cb);
      bus.set(channel, entry);
      return () => entry.delete(cb);
    },
    onReconnect: () => () => {},
  }),
}));
const publish = (data: unknown) => [...(bus.get("pane-command") ?? [])].forEach((cb) => cb(data));

const typed = vi.hoisted(() => ({ submitText: vi.fn((key: string, text: string) => key.length > 0 && text.length > 0) }));
vi.mock("../../../src/composables/useTerminalConnections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useTerminalConnections")>()),
  submitText: typed.submitText,
}));
vi.mock("../../../src/components/TerminalCell.vue", () => ({
  default: {
    name: "TerminalCell",
    props: ["expanded", "canvasAvailable"],
    emits: ["toggle-expand", "open-files", "session", "cwd"],
    template: '<div class="stub-cell" />',
  },
}));
vi.mock("../../../src/components/GuiPanel.vue", () => ({ default: { name: "GuiPanel", props: ["sessionId"], template: "<div />" } }));
const files = vi.hoisted(() => ({ showFile: vi.fn(async () => undefined) }));
vi.mock("../../../src/components/FilesPane.vue", () => ({
  default: {
    name: "FilesPane",
    props: ["cwd", "requestedPath", "initialState"],
    emits: ["close", "dirty"],
    setup: (_p: unknown, { expose, slots }: { expose: (e: Record<string, unknown>) => void; slots: { title?: () => VNode[] } }) => {
      expose({ flush: async () => undefined, reload: () => {}, snapshot: () => ({ tabs: [], activePath: null, expanded: [] }), showFile: files.showFile });
      return () => h("div", { class: "stub-files-pane" }, slots.title?.());
    },
  },
}));

const cell = (uid: number, session: string): Cell => ({ uid, session, cwd: "/work" });
const mountGrid = (cells: Cell[], expandedUid: number | null) =>
  mount(TerminalGrid, {
    props: {
      cells,
      expandedUid,
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
  });

const show = (sessionId: string, cwd = "/work") => ({ kind: "show", sessionId, cwd, path: "docs/a.md", view: "canvas" });
const check = (sessionId: string) => ({
  kind: "check",
  sessionId,
  cwd: "/work",
  id: `c-${sessionId}`,
  title: "Maths",
  items: [{ label: "Drawn", target: { path: "m.md", view: "preview" } }, { label: "Price stays text" }],
});

let posts: string[];
beforeEach(() => {
  bus.clear();
  files.showFile.mockClear();
  typed.submitText.mockClear();
  posts = [];
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") posts.push(`${url} ${String(init.body)}`);
      if (url.startsWith("/api/pane/check/")) return { ok: true, json: async () => ({ check: null }) };
      return { ok: true, json: async () => ({ groups: ["render"], tools: [] }) };
    }),
  );
});

describe("an agent's commands to its cell's right pane", () => {
  it("shows the file at once on the enlarged cell, in the asked-for view", async () => {
    const w = mountGrid([cell(1, "s1")], 1);
    await flushPromises();
    publish(show("s1"));
    await flushPromises();
    expect(w.find(".stub-files-pane").exists()).toBe(true);
    expect(files.showFile).toHaveBeenCalledWith({ kind: "show", sessionId: "s1", cwd: "/work", path: "docs/a.md", view: "canvas" });
  });

  it("keeps a command for another cell until that cell is enlarged, and leaves the screen alone meanwhile", async () => {
    const w = mountGrid([cell(1, "s1"), cell(2, "s2")], 1);
    await flushPromises();
    publish(show("s2"));
    await flushPromises();
    expect(files.showFile).not.toHaveBeenCalled();
    expect(w.find(".stub-files-pane").exists()).toBe(false);

    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(files.showFile).toHaveBeenCalledTimes(1);
  });

  // Two shows in a row: the pane ends on the second, not on whichever finished its await last.
  it("shows only the newest of two files sent back to back", async () => {
    mountGrid([cell(1, "s1")], 1);
    await flushPromises();
    publish(show("s1"));
    publish({ ...show("s1"), path: "docs/b.md" });
    await flushPromises();
    expect(files.showFile).toHaveBeenCalledTimes(1);
    expect(files.showFile).toHaveBeenCalledWith(expect.objectContaining({ path: "docs/b.md" }));
  });

  // The path is relative to the agent's directory: a pane rooted elsewhere must not open a file of the
  // same name there.
  it("does not open the file in a pane rooted in another directory", async () => {
    mountGrid([cell(1, "s1")], 1);
    await flushPromises();
    publish(show("s1", "/elsewhere"));
    await flushPromises();
    expect(files.showFile).not.toHaveBeenCalled();
  });

  it("puts a checklist over the cell, opens an item's file, and types the results when sent", async () => {
    const w = mountGrid([cell(1, "s1")], 1);
    await flushPromises();
    publish(check("s1"));
    await flushPromises();
    const card = () => w.find('[data-testid="check-card"]');
    expect(card().exists()).toBe(true);

    await w.find('[data-testid="check-open"]').trigger("click");
    await flushPromises();
    expect(files.showFile).toHaveBeenCalledWith({ path: "m.md", view: "preview" });

    const send = () => w.find('[data-testid="check-send"]');
    await w.findAll('[data-testid="check-ok"]')[0]?.trigger("click");
    expect(send().attributes("disabled")).toBeDefined();
    await w.findAll('[data-testid="check-ng"]')[1]?.trigger("click");
    await w.findAll('[data-testid="check-note"]')[1]?.setValue("drawn as a formula");
    await send().trigger("click");
    await flushPromises();

    expect(typed.submitText).toHaveBeenCalledWith("cell-1", 'Check results for "Maths" (1 NG): 1. OK: Drawn 2. NG: Price stays text — drawn as a formula');
    expect(card().exists()).toBe(false);
    expect(posts).toContain('/api/pane/check/s1/close {"id":"c-s1"}');
  });

  it("keeps the checklist up when the terminal cannot be typed into", async () => {
    typed.submitText.mockReturnValueOnce(false);
    const w = mountGrid([cell(1, "s1")], 1);
    await flushPromises();
    publish(check("s1"));
    await flushPromises();
    for (const button of w.findAll('[data-testid="check-ok"]')) await button.trigger("click");
    await w.find('[data-testid="check-send"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="check-card"]').exists()).toBe(true);
    expect(posts).toEqual([]);
  });

  // The agent was told to wait for the results, so closing the card tells it there will be none.
  it("puts a checklist away, tells the agent, and does not bring it back", async () => {
    const w = mountGrid([cell(1, "s1")], 1);
    await flushPromises();
    publish(check("s1"));
    await flushPromises();
    await w.find('[data-testid="check-close-btn"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="check-card"]').exists()).toBe(false);
    expect(typed.submitText).toHaveBeenCalledTimes(1);
    expect(typed.submitText).toHaveBeenCalledWith("cell-1", 'Check "Maths" was closed without answers.');
    expect(posts).toContain('/api/pane/check/s1/close {"id":"c-s1"}');
    publish(check("s1"));
    await flushPromises();
    expect(w.find('[data-testid="check-card"]').exists()).toBe(false);
  });

  it("closes the checklist even when the terminal cannot be typed into", async () => {
    typed.submitText.mockReturnValueOnce(false);
    const w = mountGrid([cell(1, "s1")], 1);
    await flushPromises();
    publish(check("s1"));
    await flushPromises();
    await w.find('[data-testid="check-close-btn"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="check-card"]').exists()).toBe(false);
    expect(posts).toContain('/api/pane/check/s1/close {"id":"c-s1"}');
  });

  // Only the close button speaks: a check replaced by a newer one types nothing.
  it("types nothing when a newer checklist replaces the open one", async () => {
    mountGrid([cell(1, "s1")], 1);
    await flushPromises();
    publish(check("s1"));
    publish({ ...check("s1"), id: "c-newer" });
    await flushPromises();
    expect(typed.submitText).not.toHaveBeenCalled();
  });
});
