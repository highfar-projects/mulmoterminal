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
    emits: ["close", "closing", "dirty"],
    setup: (
      _p: unknown,
      {
        expose,
        slots,
        emit,
      }: { expose: (e: Record<string, unknown>) => void; slots: { title?: () => VNode[] }; emit: (event: string, ...args: unknown[]) => void },
    ) => {
      // The close button, as FilesPane has it: hand the save over, then close once it lands.
      const requestClose = async () => {
        const saved = flush().then((result) => result !== false);
        emit("closing", saved);
        if (await saved) emit("close");
      };
      expose({ flush, reload: () => {}, snapshot, requestClose });
      return () => h("div", { class: "stub-files-pane" }, slots.title?.());
    },
  },
}));

const cell = (uid: number, session: string): Cell => ({ uid, session, cwd: `/work/${session}` });

const mountGrid = (uids: number[] = [1, 2]) =>
  mount(TerminalGrid, {
    props: {
      cells: uids.map((uid, index) => cell(uid, `s${index + 1}`)),
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
  // The files pane's close button hands its save over; the grid closes once it lands.
  if (name === "FilesPane") w.findComponent({ name }).vm.$emit("closing", Promise.resolve(true));
  else if (name) w.findComponent({ name }).vm.$emit("close");
  await flushPromises();
};
const full = (w: Grid) => w.find(".zoom-row").classes().includes("pane-full");
const QUESTION = { sessionId: "s1", toolUseId: "t1", questions: [{ question: "Pick?", header: "Pick", options: [{ label: "A" }], multiSelect: false }] };
const ask = async (done = false, sessionId = "s1") => {
  handlers.get(ASK_QUESTION_CHANNEL)?.(done ? { sessionId, toolUseId: "t1", done: true } : { ...QUESTION, sessionId });
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

  // A save that fails while the zoom moves leaves the files pane on the cell it was on. Whatever the
  // enlarged cell then asks for moves the pane to it, so the buffer is saved first there too.
  describe("while the files pane trails a zoom it could not save out of", () => {
    const trailing = async () => {
      const w = mountGrid();
      await open(w, "FilesPane");
      flush.mockResolvedValue(false);
      await w.setProps({ expandedUid: 2 });
      await flushPromises();
      expect(shown(w)).toBe("FilesPane");
      flush.mockClear();
      return w;
    };

    it("saves before the enlarged cell's question takes the pane, and stays when it cannot", async () => {
      const w = await trailing();
      await ask(false, "s2");
      expect(flush).toHaveBeenCalledTimes(1);
      expect(shown(w)).toBe("FilesPane");
    });

    it("saves before the enlarged cell's pane button takes the pane, and stays when it cannot", async () => {
      const w = await trailing();
      w.findAllComponents({ name: "TerminalCell" })
        .find((terminal) => terminal.props("expanded"))
        ?.vm.$emit("toggle-tools");
      await flushPromises();
      expect(flush).toHaveBeenCalledTimes(1);
      expect(shown(w)).toBe("FilesPane");
    });
  });

  // Each zoom move saves the files pane before leaving it, and the saves can finish in either order.
  // Every cell shows Files, so the pane on screen does not change and nothing else moves it on.
  it("leaves the pane on the cell enlarged last when two moves' saves finish out of order", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s2: ["files"], s3: ["files"] }));
    const w = mountGrid([1, 2, 3]);
    await open(w, "FilesPane");
    const finishSaves: ((saved: boolean) => void)[] = [];
    flush.mockImplementation(() => new Promise((resolve) => finishSaves.push(resolve)));
    await w.setProps({ expandedUid: 2 });
    await w.setProps({ expandedUid: 3 });
    expect(finishSaves).toHaveLength(2);
    finishSaves[1](true);
    await flushPromises();
    finishSaves[0](true);
    await flushPromises();
    expect(shown(w)).toBe("FilesPane");
    expect(w.findComponent({ name: "FilesPane" }).props("cwd")).toBe("/work/s3");
  });

  it("stays on the first cell when the zoom comes back to it before the save out of it finishes", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s2: ["files"] }));
    const w = mountGrid([1, 2]);
    await open(w, "FilesPane");
    const finishSaves: ((saved: boolean) => void)[] = [];
    flush.mockImplementation(() => new Promise((resolve) => finishSaves.push(resolve)));
    await w.setProps({ expandedUid: 2 });
    await w.setProps({ expandedUid: 1 });
    finishSaves.forEach((finish) => finish(true));
    await flushPromises();
    expect(shown(w)).toBe("FilesPane");
    expect(w.findComponent({ name: "FilesPane" }).props("cwd")).toBe("/work/s1");
  });

  // Leaving Files awaits its save, so two presses in a row can finish in either order.
  it("shows the pane pressed last when two presses' saves finish out of order", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    const finishSaves: ((saved: boolean) => void)[] = [];
    flush.mockImplementation(() => new Promise((resolve) => finishSaves.push(resolve)));
    const terminal = w.findComponent({ name: "TerminalCell" });
    terminal.vm.$emit("toggle-tools");
    terminal.vm.$emit("toggle-transcript");
    expect(finishSaves).toHaveLength(2);
    finishSaves[1](true);
    await flushPromises();
    finishSaves[0](true);
    await flushPromises();
    expect(shown(w)).toBe("TranscriptPane");
  });

  it("keeps Files when it is asked for again while a press away from it saves", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    let finishSave: (saved: boolean) => void = () => {};
    flush.mockImplementation(() => new Promise((resolve) => (finishSave = resolve)));
    w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-tools");
    await open(w, "FilesPane");
    finishSave(true);
    await flushPromises();
    expect(shown(w)).toBe("FilesPane");
  });

  it("does not move the pane for a browse a later press overtook during the flush", async () => {
    const w = mountGrid();
    await open(w, "FilesPane");
    const finishSaves: ((saved: boolean) => void)[] = [];
    flush.mockImplementation(() => new Promise((resolve) => finishSaves.push(resolve)));
    const [enlarged, tiled] = w.findAllComponents({ name: "TerminalCell" });
    tiled.vm.$emit("open-files");
    enlarged.vm.$emit("toggle-tools");
    finishSaves[1](true);
    await flushPromises();
    finishSaves[0](true);
    await flushPromises();
    expect(w.emitted("toggle-expand")).toBeUndefined();
    expect(shown(w)).toBe("ToolsPane");
  });

  // Full width is asked for on one cell. Another cell's pane starts beside its terminal, whichever
  // pane it shows, and so does a reload (#3219).
  it("does not carry full width to the cell the zoom moves to", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s2: ["tools"] }));
    const w = mountGrid();
    await open(w, "TranscriptPane");
    expect(full(w)).toBe(true);
    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(shown(w)).toBe("ToolsPane");
    expect(full(w)).toBe(false);
  });

  it("starts a conversation shown by a zoom move beside the terminal", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s2: ["transcript"] }));
    const w = mountGrid();
    await open(w, "ToolsPane");
    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(shown(w)).toBe("TranscriptPane");
    expect(full(w)).toBe(false);
  });

  // Asked for from a cell that is not enlarged, which moves the zoom there: the takeover is the request.
  const askOnTheOtherCell = async (event: "toggle-transcript" | "toggle-tools") => {
    const w = mountGrid();
    w.setProps({ "onToggle-expand": (uid: number) => w.setProps({ expandedUid: uid }) });
    await flushPromises();
    const tiled = w.findAllComponents({ name: "TerminalCell" }).find((terminal) => !terminal.props("expanded"));
    tiled?.vm.$emit(event);
    await flushPromises();
    expect(w.props("expandedUid")).toBe(2);
    return w;
  };

  it("gives the row to a conversation asked for on another cell", async () => {
    const w = await askOnTheOtherCell("toggle-transcript");
    expect(shown(w)).toBe("TranscriptPane");
    expect(full(w)).toBe(true);
  });

  it("does not hand the takeover of a refused move to a later zoom", async () => {
    const w = mountGrid();
    await flushPromises();
    const tiled = w.findAllComponents({ name: "TerminalCell" }).find((terminal) => !terminal.props("expanded"));
    tiled?.vm.$emit("toggle-transcript");
    await flushPromises();
    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(shown(w)).toBe("TranscriptPane");
    expect(full(w)).toBe(false);
  });

  it("starts another pane asked for on another cell beside the terminal", async () => {
    const w = await askOnTheOtherCell("toggle-tools");
    expect(shown(w)).toBe("ToolsPane");
    expect(full(w)).toBe(false);
  });

  it("starts a conversation restored by a reload beside the terminal", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s1: ["files", "transcript"] }));
    const w = mountGrid();
    await flushPromises();
    expect(shown(w)).toBe("TranscriptPane");
    expect(full(w)).toBe(false);
  });

  // Leaving Files and closing it both await its save; whichever finishes first, both are done (#3225).
  describe("Files closed while a press away from it saves", () => {
    const hasRequestClose = (value: unknown): value is { requestClose: () => Promise<void> } =>
      typeof value === "object" && value !== null && typeof Reflect.get(value, "requestClose") === "function";
    const pressThenClose = async () => {
      const w = mountGrid();
      await open(w, "FilesPane");
      const finishSaves: ((saved: boolean) => void)[] = [];
      flush.mockImplementation(() => new Promise((resolve) => finishSaves.push(resolve)));
      w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-tools");
      const files: unknown = w.findComponent({ name: "FilesPane" }).vm;
      if (!hasRequestClose(files)) throw new Error("the files pane stub exposes requestClose");
      void files.requestClose();
      expect(finishSaves).toHaveLength(2);
      return { w, finishSaves };
    };
    // What is on screen, what is remembered, and what closing that pane leaves.
    const outcome = async (w: Grid) => {
      const first = shown(w);
      const stored = remembered();
      await closeShown(w);
      return { first, stored, then: shown(w) };
    };
    const TOOLS_ALONE = { first: "ToolsPane", stored: { s1: ["tools"] }, then: null };

    // With nothing pressed the pane's own close does it, which also files its tree for next time.
    it("leaves an ordinary close to the pane itself", async () => {
      const w = mountGrid();
      await open(w, "FilesPane");
      const files: unknown = w.findComponent({ name: "FilesPane" }).vm;
      if (!hasRequestClose(files)) throw new Error("the files pane stub exposes requestClose");
      await files.requestClose();
      await flushPromises();
      expect(shown(w)).toBeNull();
      await open(w, "FilesPane");
      expect(w.findComponent({ name: "FilesPane" }).props("initialState")).toEqual(snapshot());
    });

    it("leaves a Files opened again before the close's save lands", async () => {
      const { w, finishSaves } = await pressThenClose();
      finishSaves[0](true);
      await flushPromises();
      flush.mockResolvedValue(undefined);
      await open(w, "FilesPane");
      await open(w, "TranscriptPane");
      finishSaves[1](true);
      await flushPromises();
      expect(remembered()).toEqual({ s1: ["tools", "files", "transcript"] });
    });

    it("when both saves finish together", async () => {
      const { w, finishSaves } = await pressThenClose();
      finishSaves[0](true);
      finishSaves[1](true);
      await flushPromises();
      expect(await outcome(w)).toEqual(TOOLS_ALONE);
    });

    it("when the zoom moves away before the close's save lands", async () => {
      const w = mountGrid();
      await open(w, "FilesPane");
      const finishSaves: ((saved: boolean) => void)[] = [];
      flush.mockImplementation(() => new Promise((resolve) => finishSaves.push(resolve)));
      const files: unknown = w.findComponent({ name: "FilesPane" }).vm;
      if (!hasRequestClose(files)) throw new Error("the files pane stub exposes requestClose");
      void files.requestClose();
      await w.setProps({ expandedUid: 2 });
      finishSaves[1](true);
      await flushPromises();
      finishSaves[0](true);
      await flushPromises();
      expect(remembered()).toEqual({});
      await w.setProps({ expandedUid: 1 });
      await flushPromises();
      expect(shown(w)).toBeNull();
    });

    it("when the press's save finishes first", async () => {
      const { w, finishSaves } = await pressThenClose();
      finishSaves[0](true);
      await flushPromises();
      finishSaves[1](true);
      await flushPromises();
      expect(await outcome(w)).toEqual(TOOLS_ALONE);
    });

    it("when the close's save finishes first", async () => {
      const { w, finishSaves } = await pressThenClose();
      finishSaves[1](true);
      await flushPromises();
      finishSaves[0](true);
      await flushPromises();
      expect(await outcome(w)).toEqual(TOOLS_ALONE);
    });
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
