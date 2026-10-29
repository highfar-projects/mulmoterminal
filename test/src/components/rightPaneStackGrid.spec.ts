import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { h, type VNode } from "vue";
import TerminalGrid from "../../../src/components/TerminalGrid.vue";
import type { Cell } from "../../../src/components/gridTabs.js";
import { ASK_QUESTION_CHANNEL } from "../../../common/askQuestion";

// The right pane's panes STACK (#3213): closing the one on screen shows the one it covered, a
// question lays itself over the top for as long as it is open, and a reload brings the stack back.

const handlers = new Map<string, (data: unknown) => void>();
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({
    subscribe: (channel: string, handler: (data: unknown) => void) => {
      handlers.set(channel, handler);
      return () => handlers.delete(channel);
    },
    onReconnect: () => () => {},
  }),
}));
vi.mock("../../../src/components/TerminalCell.vue", () => ({
  default: {
    name: "TerminalCell",
    props: ["expanded", "rightPane", "canvasAvailable"],
    emits: ["toggle-expand", "open-files", "toggle-canvas", "toggle-tools", "toggle-transcript", "session", "cwd", "run", "close", "move", "status"],
    template: '<div class="stub-cell" />',
  },
}));
vi.mock("../../../src/components/CommandCell.vue", () => ({
  default: { name: "CommandCell", props: ["expanded", "command"], emits: ["toggle-expand", "close", "move", "status"], template: "<div />" },
}));
vi.mock("../../../src/components/LauncherCell.vue", () => ({
  default: { name: "LauncherCell", props: ["expanded", "launcher"], emits: ["toggle-expand", "close", "move", "status", "session"], template: "<div />" },
}));
vi.mock("../../../src/components/ToolsPane.vue", () => ({
  default: { name: "ToolsPane", props: ["sessionId", "expanded"], emits: ["toggleExpand", "close"], template: '<div class="stub-tools" />' },
}));
vi.mock("../../../src/components/TranscriptPane.vue", () => ({
  default: { name: "TranscriptPane", props: ["sessionId", "cwd", "agent", "expanded"], emits: ["toggleExpand", "close"], template: "<div />" },
}));
vi.mock("../../../src/components/QuestionPane.vue", () => ({
  default: { name: "QuestionPane", props: ["event", "failure", "expanded"], emits: ["answer", "say", "toggle-expand", "close"], template: "<div />" },
}));
const flush = vi.fn(async (): Promise<boolean | undefined> => undefined);
const snapshot = vi.fn(() => ({ tabs: [{ path: "notes.md" }], activePath: "notes.md", expanded: ["docs"] }));
vi.mock("../../../src/components/FilesPane.vue", () => ({
  default: {
    name: "FilesPane",
    props: ["cwd", "requestedPath", "initialState"],
    emits: ["close", "dirty"],
    setup: (_p: unknown, { expose, slots }: { expose: (e: Record<string, unknown>) => void; slots: { title?: () => VNode[] } }) => {
      expose({ flush, reload: () => {}, snapshot });
      return () => h("div", { class: "stub-files-pane" }, slots.title?.());
    },
  },
}));

const cell = (uid: number, session: string): Cell => ({ uid, session, cwd: "/work" });

const mountGrid = (uids: [number, number] = [1, 2]) =>
  mount(TerminalGrid, {
    props: {
      cells: [cell(uids[0], "s1"), cell(uids[1], "s2")],
      expandedUid: uids[0],
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
type PaneName = "FilesPane" | "ToolsPane" | "TranscriptPane" | "QuestionPane";
const PANE_NAMES: PaneName[] = ["FilesPane", "ToolsPane", "TranscriptPane", "QuestionPane"];
const EVENTS: Record<Exclude<PaneName, "QuestionPane">, string> = { FilesPane: "open-files", ToolsPane: "toggle-tools", TranscriptPane: "toggle-transcript" };

const shown = (w: Grid): PaneName | null => PANE_NAMES.find((name) => w.findComponent({ name }).exists()) ?? null;
const open = async (w: Grid, name: Exclude<PaneName, "QuestionPane">) => {
  w.findComponent({ name: "TerminalCell" }).vm.$emit(EVENTS[name]);
  await flushPromises();
};
const closeShown = async (w: Grid) => {
  const name = shown(w);
  if (name) w.findComponent({ name }).vm.$emit("close");
  await flushPromises();
};
const full = (w: Grid) => w.find(".zoom-row").classes().includes("pane-full");
const QUESTION = { sessionId: "s1", toolUseId: "t1", questions: [{ question: "Pick?", header: "Pick", options: [{ label: "A" }], multiSelect: false }] };
const ask = async (done = false) => {
  handlers.get(ASK_QUESTION_CHANNEL)?.(done ? { sessionId: "s1", toolUseId: "t1", done: true } : QUESTION);
  await flushPromises();
};
const remembered = () => JSON.parse(localStorage.getItem("pane_open_by_session") ?? "{}");

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  localStorage.clear();
  flush.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ groups: ["render"], tools: [] }) })),
  );
});

describe("stacked right panes", () => {
  it("shows the files pane again when the conversation opened over it is closed", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    await open(w, "TranscriptPane");
    expect(shown(w)).toBe("TranscriptPane");
    await closeShown(w);
    expect(shown(w)).toBe("FilesPane");
    expect(w.findComponent({ name: "FilesPane" }).props("initialState")).toEqual(snapshot());
    expect(full(w)).toBe(false);
    await closeShown(w);
    expect(shown(w)).toBeNull();
  });

  it("moves a pane opened again to the top instead of stacking it twice", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    await open(w, "ToolsPane");
    await open(w, "FilesPane");
    expect(remembered()).toEqual({ s1: ["tools", "files"] });
    await closeShown(w);
    expect(shown(w)).toBe("ToolsPane");
    await closeShown(w);
    expect(shown(w)).toBeNull();
  });

  it("gives the row back to the conversation when the pane over it is closed", async () => {
    const w = mountGrid();
    await open(w, "TranscriptPane");
    await open(w, "ToolsPane");
    expect(full(w)).toBe(false);
    await closeShown(w);
    expect(shown(w)).toBe("TranscriptPane");
    expect(full(w)).toBe(true);
  });

  it("lays a question over the top pane and shows that pane again once it is answered", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    await open(w, "TranscriptPane");
    await ask();
    expect(shown(w)).toBe("QuestionPane");
    expect(full(w)).toBe(false);
    expect(remembered()).toEqual({ s1: ["files", "transcript"] });
    await ask(true);
    expect(shown(w)).toBe("TranscriptPane");
    expect(full(w)).toBe(true);
  });

  // The question unmounts the editor beneath it, so an unsaved buffer is written first.
  it("saves the files pane before a question covers it", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    flush.mockClear();
    await ask();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(shown(w)).toBe("QuestionPane");
  });

  it("keeps the files pane on screen when its buffer could not be saved", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    flush.mockResolvedValue(false);
    await ask();
    expect(shown(w)).toBe("FilesPane");
  });

  it("leaves a pane opened while the save was in flight in front of the question", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    let finishSave: (saved: undefined) => void = () => {};
    flush.mockReturnValueOnce(new Promise((resolve) => (finishSave = resolve)));
    handlers.get(ASK_QUESTION_CHANNEL)?.(QUESTION);
    await open(w, "ToolsPane");
    finishSave(undefined);
    await flushPromises();
    expect(shown(w)).toBe("ToolsPane");
  });

  it("shows the top pane again when the question is closed by hand", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    await ask();
    await closeShown(w);
    expect(shown(w)).toBe("FilesPane");
  });

  it("lets a pane opened over a question take its place", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    await ask();
    await open(w, "ToolsPane");
    expect(shown(w)).toBe("ToolsPane");
    await closeShown(w);
    expect(shown(w)).toBe("FilesPane");
  });

  it("brings the whole stack back after a reload", async () => {
    const before = mountGrid();
    await open(before, "FilesPane");
    await open(before, "ToolsPane");
    before.unmount();

    const w = mountGrid([7, 8]);
    await flushPromises();
    expect(shown(w)).toBe("ToolsPane");
    await closeShown(w);
    expect(shown(w)).toBe("FilesPane");
  });

  it("reads the one pane remembered before panes stacked", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s1: "tools", s2: "question" }));
    const w = mountGrid();
    await flushPromises();
    expect(shown(w)).toBe("ToolsPane");
    await closeShown(w);
    expect(shown(w)).toBeNull();
    expect(remembered()).toEqual({});
  });
});
