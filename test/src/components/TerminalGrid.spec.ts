import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, DOMWrapper } from "@vue/test-utils";
import { h, nextTick, type VNode } from "vue";
import TerminalGrid, { type CockpitRow } from "../../../src/components/TerminalGrid.vue";
import type { Cell } from "../../../src/components/gridTabs.js";
import type { RunCommand } from "../../../src/components/runCommand.js";
import { setCockpitLines } from "../../../src/composables/cockpitLines";

// Stub the cells so the page renderer can be tested without Terminal/xterm/pub-sub.
// The host drives the pane through reload()/confirmDiscard(); spies here are what let the
// contract be asserted rather than the prop that merely claims it.
const paneStub = vi.hoisted(() => ({
  reload: vi.fn(),
  flush: vi.fn(async () => undefined),
  snapshot: vi.fn((): { openPath: string | null; expanded: string[]; showPreview?: boolean } => ({ openPath: "README.md", expanded: ["src"] })),
  showError: vi.fn(),
}));
vi.mock("../../../src/components/FilesPane.vue", () => ({
  default: {
    name: "FilesPane",
    props: ["cwd", "requestedPath", "initialState", "canvasTarget"],
    emits: ["close", "dirty", "open-in-canvas"],
    setup: (_p: unknown, { expose, slots }: { expose: (e: Record<string, unknown>) => void; slots: { title?: () => VNode[] } }) => {
      expose({ reload: paneStub.reload, flush: paneStub.flush, snapshot: paneStub.snapshot, showError: paneStub.showError });
      return () => h("div", { class: "stub-files-pane" }, slots.title?.());
    },
  },
}));
vi.mock("../../../src/components/TerminalCell.vue", () => ({
  default: {
    name: "TerminalCell",
    props: ["expanded", "initialSessionId", "initialCwd", "defaultCwd", "presets", "home", "openSessionIds", "reorderable", "canvasAvailable"],
    emits: ["toggle-expand", "toggle-files", "toggle-prompts", "session", "cwd", "run", "close", "move", "status", "canvas"],
    template: '<div class="stub-cell" />',
  },
}));
vi.mock("../../../src/components/GuiPanel.vue", () => ({
  default: {
    name: "GuiPanel",
    props: ["sessionId", "sendTextMessage", "unavailable", "expanded"],
    emits: ["toggle-expand", "close"],
    template: '<div class="stub-gui-panel" />',
  },
}));
vi.mock("../../../src/components/PromptsPane.vue", () => ({
  default: {
    name: "PromptsPane",
    props: ["sessionId", "cwd", "agent", "expanded"],
    emits: ["toggle-expand", "close"],
    template: '<div class="stub-prompts-pane" />',
  },
}));
vi.mock("../../../src/components/CommandCell.vue", () => ({
  default: {
    name: "CommandCell",
    props: ["expanded", "command", "home", "reorderable"],
    emits: ["toggle-expand", "close", "move", "status"],
    template: '<div class="stub-command-cell" />',
  },
}));
vi.mock("../../../src/components/LauncherCell.vue", () => ({
  default: {
    name: "LauncherCell",
    props: ["uid", "expanded", "launcher", "session", "cwd", "home", "reorderable"],
    emits: ["toggle-expand", "close", "move", "status", "session"],
    template: '<div class="stub-launcher-cell" />',
  },
}));

const cell = (uid: number, session: string | null = null, cwd: string | null = null): Cell => ({ uid, session, cwd });
const cmdCell = (uid: number, command: NonNullable<Cell["command"]>): Cell => ({ uid, session: null, cwd: null, command });
const mountGrid = (cells: Cell[], expandedUid: number | null = null, reorderable = false) =>
  mount(TerminalGrid, {
    props: {
      cells,
      expandedUid,
      listRows: [],
      defaultCwd: "/work",
      presets: [],
      launchers: [],
      home: "/work",
      openSessionIds: [],
      openCwds: [],
      reorderable,
      listMode: true,
    },
  });
const cellsOf = (w: ReturnType<typeof mount>) => w.findAllComponents({ name: "TerminalCell" });
const commandCellsOf = (w: ReturnType<typeof mount>) => w.findAllComponents({ name: "CommandCell" });

const rosterRow = (uid: number, over: Partial<CockpitRow> = {}): CockpitRow => ({
  uid,
  cwd: "/work",
  agent: "claude",
  status: "idle",
  memo: null,
  summary: null,
  prompt: null,
  response: null,
  fallback: null,
  phase: "none",
  workPhase: null,
  collection: null,
  headerColor: null,
  headerTextColor: null,
  iconUrl: null,
  parked: false,
  ...over,
});
const mountCockpit = (cells: Cell[], expandedUid: number, listRows: CockpitRow[], reorderable = false, listMode = true) =>
  mount(TerminalGrid, {
    props: {
      cells,
      expandedUid,
      listRows,
      defaultCwd: "/work",
      presets: [],
      launchers: [],
      home: "/work",
      openSessionIds: [],
      openCwds: [],
      reorderable,
      listMode,
    },
  });

describe("TerminalGrid (page renderer)", () => {
  it("renders one TerminalCell per cell", () => {
    expect(cellsOf(mountGrid([cell(0), cell(1), cell(2)]))).toHaveLength(3);
  });

  it("passes session / cwd / expanded through to the cells", () => {
    const cs = cellsOf(mountGrid([cell(0, "s0", "/a"), cell(1, "s1", "/b")], 1));
    expect(cs[0].props("initialSessionId")).toBe("s0");
    expect(cs[0].props("expanded")).toBe(false);
    expect(cs[1].props("expanded")).toBe(true);
  });

  it("re-emits each cell event tagged with the cell uid", () => {
    const w = mountGrid([cell(7, "s")]);
    cellsOf(w)[0].vm.$emit("session", "new");
    cellsOf(w)[0].vm.$emit("cwd", "/x");
    cellsOf(w)[0].vm.$emit("close");
    cellsOf(w)[0].vm.$emit("toggle-expand");
    expect(w.emitted("session")?.[0]).toEqual([7, "new"]);
    expect(w.emitted("cwd")?.[0]).toEqual([7, "/x"]);
    expect(w.emitted("close")?.[0]).toEqual([7]);
    expect(w.emitted("toggle-expand")?.[0]).toEqual([7]);
  });

  it("passes reorderable through and re-emits move/status tagged with uid", () => {
    const w = mountGrid([cell(7, "s")], null, true);
    expect(cellsOf(w)[0].props("reorderable")).toBe(true);
    cellsOf(w)[0].vm.$emit("move", 1);
    cellsOf(w)[0].vm.$emit("status", "waiting");
    expect(w.emitted("move")?.[0]).toEqual([7, 1]);
    expect(w.emitted("status")?.[0]).toEqual([7, "waiting"]);
  });

  // rosterAlertClass is covered on its own, but nothing asserted that the ROW actually passes
  // `row.parked` into it — a binding that could read `false` forever while every unit test still
  // passed. Same shape of gap as the Terminal.vue input wire (#992 review).
  it("sinks the roster row of a parked session, and leaves its neighbours alone", async () => {
    const cells = [cell(0, "s0"), cell(1, "s1")];
    const w = mountCockpit(cells, 0, [rosterRow(0), rosterRow(1, { parked: true })]);
    await nextTick();
    const rows = w.findAll('[data-testid="cockpit-row"]');
    expect(rows[1].classes()).toContain("opacity-45");
    expect(rows[0].classes()).not.toContain("opacity-45");
  });

  it("puts a ⋮ reorder menu on cockpit rows only in manual mode, emitting move tagged with uid", async () => {
    const cells = [cell(0, "s0"), cell(1, "s1"), cell(2)]; // two running + a trailing launch cell
    const rows = [rosterRow(0), rosterRow(1)];
    // auto mode (reorderable = false): the roster renders but carries no ⋮
    const auto = mountCockpit(cells, 0, rows);
    await nextTick();
    expect(auto.findAll('[data-testid="cockpit-row"]')).toHaveLength(2); // roster is shown
    expect(auto.find('[data-testid="cockpit-reorder"]').exists()).toBe(false);
    // manual mode: a ⋮ per row, and moving the 2nd row up emits move tagged with its uid
    const w = mountCockpit(cells, 0, rows, true);
    await nextTick();
    const kebabs = w.findAll('[data-testid="cockpit-reorder"]');
    expect(kebabs).toHaveLength(2);
    await kebabs[1].trigger("click");
    // the dropdown is teleported to <body>, so reach it through the document
    await new DOMWrapper(document.querySelector('[data-testid="reorder-up"]') as Element).trigger("click");
    expect(w.emitted("move")?.[0]).toEqual([1, -1]);
    w.unmount();
  });

  // #2126: the ⋮ moves a row one step, which is a lot of presses on a long roster. The handle drags
  // it anywhere, and what the drag SHOWS is the list itself re-ordered live. jsdom has no DragEvent
  // and gives every element a zero-sized rect, so the events are built by hand and the rows' own
  // geometry is stated.
  describe("cockpit drag-and-drop reorder", () => {
    // Two running cells and a trailing launcher — and a roster row for EACH, which is what GridView
    // renders (listRows is the whole ordered list, launch cells included).
    const dragCells = [cell(0, "s0"), cell(1, "s1"), cell(2)];
    const dragRows = [rosterRow(0), rosterRow(1), rosterRow(2)];
    const ROW_H = 100;

    const transfer = () => ({ effectAllowed: "", dropEffect: "", setData: vi.fn(), setDragImage: vi.fn() });
    const fire = (el: Element, type: string, props: Record<string, unknown> = {}) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value, configurable: true });
      el.dispatchEvent(event);
      return event;
    };

    const rowsOf = (w: ReturnType<typeof mount>) => w.findAll('[data-testid="cockpit-row"]');
    // The rendered order, which is the preview while a drag is in flight.
    const order = (w: ReturnType<typeof mount>) => rowsOf(w).map((r) => r.attributes("data-uid"));
    // The component measures each row's SETTLED box — `offsetTop` / `offsetHeight` against the
    // aside's own rect — and jsdom hands out zeros for all of it. State the geometry of the slots
    // the rows are in NOW, exactly as a browser would report it after a re-order.
    const layout = (w: ReturnType<typeof mount>) => {
      const aside = w.get('[data-testid="cockpit"]').element;
      // Read twice: `rosterRowBoxes` turns offsetTop into viewport coordinates with it, and the
      // leave rule asks whether the pointer is still inside it.
      Object.defineProperty(aside, "getBoundingClientRect", {
        value: () => ({ top: 0, height: 900, bottom: 900, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) }),
        configurable: true,
      });
      rowsOf(w).forEach((row, i) => {
        Object.defineProperty(row.element, "offsetTop", { value: i * ROW_H, configurable: true });
        Object.defineProperty(row.element, "offsetHeight", { value: ROW_H, configurable: true });
      });
    };

    const mountDrag = async (cells = dragCells, rows = dragRows, reorderable = true) => {
      const w = mountCockpit(cells, 0, rows, reorderable);
      await nextTick();
      layout(w);
      return { w, roster: w.get('[data-testid="cockpit"]').element };
    };
    const startDrag = (w: ReturnType<typeof mount>, nth: number) =>
      fire(w.findAll('[data-testid="cockpit-drag"]')[nth].element, "dragstart", { dataTransfer: transfer() });
    // One pointer step: move, let the list re-render, and re-measure what is now under the pointer.
    const dragTo = async (w: ReturnType<typeof mount>, roster: Element, clientY: number) => {
      const event = fire(roster, "dragover", { clientY, dataTransfer: transfer() });
      await nextTick();
      layout(w);
      return event;
    };

    it("puts a drag handle on every row in manual mode and none in auto", async () => {
      const { w } = await mountDrag();
      expect(w.findAll('[data-testid="cockpit-drag"]')).toHaveLength(3);
      const auto = mountCockpit(dragCells, 0, dragRows, false);
      await nextTick();
      expect(auto.find('[data-testid="cockpit-drag"]').exists()).toBe(false);
    });

    // The ghost has to be the ROW — the handle is 16px, so the browser's default would be 16px of
    // icon. setData is Firefox's precondition for starting a drag at all.
    it("drags the row, not the handle: the transfer carries the row as its drag image", async () => {
      const { w } = await mountDrag();
      const dt = transfer();
      fire(w.findAll('[data-testid="cockpit-drag"]')[1].element, "dragstart", { dataTransfer: dt });
      expect(dt.setDragImage).toHaveBeenCalledWith(rowsOf(w)[1].element, expect.any(Number), expect.any(Number));
      expect(dt.setData).toHaveBeenCalled();
      expect(dt.effectAllowed).toBe("move");
    });

    it("re-orders the rows live while dragging, and commits the slot the preview was showing", async () => {
      const { w, roster } = await mountDrag();
      startDrag(w, 2);
      const over = await dragTo(w, roster, 20); // upper half of the first row
      expect(over.defaultPrevented).toBe(true); // required for `drop` to fire
      expect(order(w)).toEqual(["2", "0", "1"]); // the list ALREADY shows where it lands

      fire(roster, "drop", { clientY: 20, dataTransfer: transfer() });
      expect(w.emitted("move-before")?.[0]).toEqual([2, 0]);
      await nextTick();
      expect(order(w)).toEqual(["0", "1", "2"]); // back to the prop order — the parent owns the move
    });

    // A drop only fires on the element the browser calls the current target, re-hit-tested as the
    // drag moves: re-ordering the list puts a DIFFERENT row under a still pointer, so the row that
    // accepted the last dragover is not the one released on and NO drop arrives. Found in a real
    // browser — the preview worked and the reorder was lost. `dragend` always arrives.
    it("commits on dragend when no drop event arrives at all", async () => {
      const { w, roster } = await mountDrag();
      const handle = w.findAll('[data-testid="cockpit-drag"]')[2].element;
      fire(handle, "dragstart", { dataTransfer: transfer() });
      await dragTo(w, roster, 20);
      expect(order(w)).toEqual(["2", "0", "1"]);
      fire(handle, "dragend", { dataTransfer: transfer() });
      expect(w.emitted("move-before")?.[0]).toEqual([2, 0]);
    });

    // ...and it must not commit twice when both arrive.
    // `dragend` is what clears the state, and it is the one event in the gesture that arrives at an
    // element rather than at the roster — so a drag whose handle went away (a sort-mode flip, a row
    // removed) can end without it. Starting a drag clears whatever the last one left, so a stale
    // target can never be committed by a later gesture.
    it("starts each drag from a clean slate rather than inheriting the last one's target", async () => {
      const { w, roster } = await mountDrag();
      startDrag(w, 2);
      await dragTo(w, roster, 20);
      expect(order(w)).toEqual(["2", "0", "1"]);
      startDrag(w, 1); // no dragend for the first one
      await nextTick();
      expect(order(w)).toEqual(["0", "1", "2"]); // the first drag's preview is gone
      fire(w.findAll('[data-testid="cockpit-drag"]')[1].element, "dragend", { dataTransfer: transfer() });
      expect(w.emitted("move-before")).toBeUndefined();
    });

    it("commits once when the drop arrives and dragend follows it", async () => {
      const { w, roster } = await mountDrag();
      const handle = w.findAll('[data-testid="cockpit-drag"]')[2].element;
      fire(handle, "dragstart", { dataTransfer: transfer() });
      await dragTo(w, roster, 20);
      fire(roster, "drop", { clientY: 20, dataTransfer: transfer() });
      fire(handle, "dragend", { dataTransfer: transfer() });
      expect(w.emitted("move-before")).toHaveLength(1);
    });

    // Escape cancels, and `dragend` reports it exactly as it reports a drop the browser declined.
    it("commits nothing when the drag is cancelled with Escape", async () => {
      const { w, roster } = await mountDrag();
      const handle = w.findAll('[data-testid="cockpit-drag"]')[2].element;
      fire(handle, "dragstart", { dataTransfer: transfer() });
      await dragTo(w, roster, 20);
      expect(order(w)).toEqual(["2", "0", "1"]);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await nextTick();
      expect(order(w)).toEqual(["0", "1", "2"]);
      fire(handle, "dragend", { dataTransfer: transfer() });
      expect(w.emitted("move-before")).toBeUndefined();
    });

    // ...and only while a drag is in flight. An auto/priority re-sort re-orders this same list on
    // every status change, and rosterAlertClasses.ts rations motion here to one blinking state on
    // purpose — the slide is the user placing a row, not the list re-ranking itself.
    it("animates the re-order while dragging, and not otherwise", async () => {
      const { w } = await mountDrag();
      const group = w.findComponent({ name: "TransitionGroup" });
      expect(group.exists()).toBe(true);
      expect(group.props("moveClass")).toBe("transition-none");
      startDrag(w, 2);
      await nextTick();
      expect(group.props("moveClass")).toContain("transition-transform");
      expect(group.props("moveClass")).toContain("motion-reduce:transition-none");
      // The duration is a CSS variable so Tailwind can generate the rule from literal text.
      expect(w.get('[data-testid="cockpit"]').attributes("style")).toContain("--roster-move-ms");
      fire(w.findAll('[data-testid="cockpit-drag"]')[2].element, "dragend", { dataTransfer: transfer() });
      await nextTick();
      expect(group.props("moveClass")).toBe("transition-none");
    });

    it("previews the row's landing slot below a neighbour, naming the row after it", async () => {
      const { w, roster } = await mountDrag();
      startDrag(w, 0);
      await dragTo(w, roster, 180); // lower half of the second row -> in front of the third
      expect(order(w)).toEqual(["1", "0", "2"]);
      fire(roster, "drop", { clientY: 180, dataTransfer: transfer() });
      expect(w.emitted("move-before")?.[0]).toEqual([0, 2]);
    });

    it("refuses the slot after the trailing launcher: the preview does not move there", async () => {
      const { w, roster } = await mountDrag();
      startDrag(w, 0);
      await dragTo(w, roster, 280); // lower half of the LAST row, which is the launcher
      expect(order(w)).toEqual(["0", "1", "2"]); // unchanged
      fire(roster, "drop", { clientY: 280, dataTransfer: transfer() });
      expect(w.emitted("move-before")).toBeUndefined();
    });

    // With no launcher holding the last slot, the end of the list IS a destination.
    it("drops a row at the end of a list that does not end in a launcher", async () => {
      const { w, roster } = await mountDrag([cell(0, "s0"), cell(1, "s1")], [rosterRow(0), rosterRow(1)]);
      startDrag(w, 0);
      await dragTo(w, roster, 180); // lower half of the last row
      expect(order(w)).toEqual(["1", "0"]);
      fire(roster, "drop", { clientY: 180, dataTransfer: transfer() });
      expect(w.emitted("move-before")?.[0]).toEqual([0, null]);
    });

    // The rows slide under a pointer that has not moved, so every dragover after a re-order reports
    // the same y against new geometry. It has to come out the same, or the list would bounce between
    // two orders while the user holds still — which is what naming the destination by IDENTITY buys
    // over naming it by position.
    it("answers a pointer position it has already answered the same way", async () => {
      const { w, roster } = await mountDrag();
      startDrag(w, 2);
      await dragTo(w, roster, 20);
      expect(order(w)).toEqual(["2", "0", "1"]);
      await dragTo(w, roster, 20); // same y, different row in that slot now
      expect(order(w)).toEqual(["2", "0", "1"]);
    });

    // ...but the geometry moves for reasons the pointer knows nothing about: Chrome auto-scrolls an
    // overflowing roster while you hold still near its edge, and the splitter resizes it. A cache
    // keyed on `clientY` went stale exactly there and committed the slot from before the scroll
    // (Codex round 1, P2). Every dragover re-measures now.
    it("re-answers the same pointer position when the roster itself moved under it", async () => {
      const { w, roster } = await mountDrag();
      startDrag(w, 2);
      await dragTo(w, roster, 120); // upper half of the second slot -> in front of row 1
      expect(order(w)).toEqual(["0", "2", "1"]);
      // Chrome auto-scrolls the overflowing roster two rows while the pointer holds still. The same
      // 120 is now below every row, which names the end of the list instead.
      Object.defineProperty(roster, "scrollTop", { value: 2 * ROW_H, configurable: true });
      fire(roster, "dragover", { clientY: 120, dataTransfer: transfer() });
      await nextTick();
      expect(order(w)).toEqual(["0", "1", "2"]);
    });

    // Hovering the dragged row's own slot says nothing new, and must not collapse the preview.
    it("holds the preview when the pointer is over the row being dragged", async () => {
      const { w, roster } = await mountDrag();
      startDrag(w, 2);
      await dragTo(w, roster, 20);
      await dragTo(w, roster, 40); // still the upper half of the dragged row's new slot
      expect(order(w)).toEqual(["2", "0", "1"]);
    });

    it("leaves the enlarged cell alone: the handle swallows its own click, and a drop is not one", async () => {
      const { w, roster } = await mountDrag();
      await w.findAll('[data-testid="cockpit-drag"]')[1].trigger("click");
      expect(w.emitted("toggle-expand")).toBeUndefined();
      startDrag(w, 1);
      await dragTo(w, roster, 20);
      fire(roster, "drop", { clientY: 20, dataTransfer: transfer() });
      expect(w.emitted("toggle-expand")).toBeUndefined();
    });

    it("ignores a drag it did not start (a file dropped on the roster is not a reorder)", async () => {
      const { w, roster } = await mountDrag();
      const over = await dragTo(w, roster, 20);
      expect(over.defaultPrevented).toBe(false);
      expect(order(w)).toEqual(["0", "1", "2"]);
      fire(roster, "drop", { clientY: 20, dataTransfer: transfer() });
      expect(w.emitted("move-before")).toBeUndefined();
    });

    it("puts the rows back when the pointer leaves the roster, but not when it merely lets go", async () => {
      const { w, roster } = await mountDrag();
      startDrag(w, 2);
      await dragTo(w, roster, 20);
      expect(order(w)).toEqual(["2", "0", "1"]);
      // The release itself reports no relatedTarget, and happens where the pointer is; reading that
      // as "gone" would wipe the target a beat before the commit reads it.
      fire(roster, "dragleave", { relatedTarget: null, clientX: 100, clientY: 20 });
      await nextTick();
      expect(order(w)).toEqual(["2", "0", "1"]);
      fire(roster, "dragleave", { relatedTarget: document.body, clientX: 100, clientY: 20 });
      await nextTick();
      expect(order(w)).toEqual(["0", "1", "2"]);
    });

    // Exiting the WINDOW reports no relatedTarget too, and that one is a leave — treating it as the
    // release let a drag carried out of the browser and let go there commit the last slot the roster
    // had shown (Codex round 1, P2). The pointer separates them.
    it("puts the rows back when the drag leaves the window, and commits nothing", async () => {
      const { w, roster } = await mountDrag();
      const handle = w.findAll('[data-testid="cockpit-drag"]')[2].element;
      fire(handle, "dragstart", { dataTransfer: transfer() });
      await dragTo(w, roster, 20);
      expect(order(w)).toEqual(["2", "0", "1"]);
      fire(roster, "dragleave", { relatedTarget: null, clientX: 100, clientY: -40 }); // above the viewport
      await nextTick();
      expect(order(w)).toEqual(["0", "1", "2"]);
      fire(handle, "dragend", { dataTransfer: transfer() });
      expect(w.emitted("move-before")).toBeUndefined();
    });
  });

  it("adds the zoomed class only when a cell is expanded", async () => {
    expect(
      mountGrid([cell(0, "s")], null)
        .find(".stage")
        .classes(),
    ).not.toContain("zoomed");
    const w = mountGrid([cell(0, "s")], 0);
    await nextTick();
    expect(w.find(".stage").classes()).toContain("zoomed");
  });
});

describe("TerminalGrid command cells", () => {
  const CMD: RunCommand = { source: "script", index: 1, label: "Dev server", cwd: "/work/proj" };

  it("renders a CommandCell (not a TerminalCell) for a cell carrying a command", () => {
    const w = mountGrid([cmdCell(3, CMD)]);
    expect(cellsOf(w)).toHaveLength(0);
    expect(commandCellsOf(w)).toHaveLength(1);
    expect(commandCellsOf(w)[0].props("command")).toEqual(CMD);
    expect(commandCellsOf(w)[0].props("home")).toBe("/work");
  });

  it("renders a command cell beside a session cell", () => {
    const w = mountGrid([cell(0, "s0"), cmdCell(1, CMD)]);
    expect(cellsOf(w)).toHaveLength(1);
    expect(commandCellsOf(w)).toHaveLength(1);
  });

  it("re-emits 'run' from a launcher tagged with the cell uid", () => {
    const w = mountGrid([cell(7)]);
    cellsOf(w)[0].vm.$emit("run", CMD);
    expect(w.emitted("run")?.[0]).toEqual([7, CMD]);
  });

  it("re-emits close / toggle-expand from a command cell tagged with uid", () => {
    const w = mountGrid([cmdCell(4, CMD)]);
    commandCellsOf(w)[0].vm.$emit("close");
    commandCellsOf(w)[0].vm.$emit("toggle-expand");
    expect(w.emitted("close")?.[0]).toEqual([4]);
    expect(w.emitted("toggle-expand")?.[0]).toEqual([4]);
  });
});

describe("active-cell focus zoom", () => {
  const focus = (w: ReturnType<typeof mount>, uid: number) => w.get(`[data-uid="${uid}"]`).element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  const cls = (w: ReturnType<typeof mount>, uid: number) => w.get(`[data-uid="${uid}"]`).classes();

  it("marks only the focused cell, and moves the mark when another cell takes focus", async () => {
    const w = mountGrid([cell(0, "s0"), cell(1, "s1")]);
    focus(w, 0);
    await nextTick();
    expect(cls(w, 0)).toContain("focused");
    expect(cls(w, 1)).not.toContain("focused");

    focus(w, 1);
    await nextTick();
    expect(cls(w, 0)).not.toContain("focused"); // the emphasis is single-source-of-truth
    expect(cls(w, 1)).toContain("focused");
  });

  it("stays sticky: focus leaving the grid does not clear it", async () => {
    const w = mountGrid([cell(0, "s0"), cell(1, "s1")]);
    focus(w, 0);
    await nextTick();
    // A focusin whose target is outside any cell (e.g. the toolbar) must not move the mark.
    document.body.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await nextTick();
    expect(cls(w, 0)).toContain("focused");
  });

  it("does not zoom while a cell is expanded (filmstrip owns the emphasis)", async () => {
    const w = mountGrid([cell(0, "s0"), cell(1, "s1")], 0);
    focus(w, 1);
    await nextTick();
    expect(cls(w, 1)).not.toContain("focused");
  });
});

describe("grid cockpit (list view)", () => {
  it("shows the roster in list mode and the thumbnail strip otherwise (driven by the listMode prop)", async () => {
    const w = mountCockpit([cell(0, "s0"), cell(1, "s1")], 0, [rosterRow(0), rosterRow(1)]);
    await nextTick();
    expect(w.find('[data-testid="cockpit"]').exists()).toBe(true);
    expect(w.find(".stage").classes()).toContain("listmode");
    expect(w.findAll('[data-testid="cockpit-row"]')).toHaveLength(2);

    await w.setProps({ listMode: false });
    expect(w.find('[data-testid="cockpit"]').exists()).toBe(false); // roster gone
    expect(w.find(".stage").classes()).not.toContain("listmode"); // filmstrip mode
  });

  it("keeps roster rows full-height (shrink-0) so a long list scrolls instead of squishing (#722)", async () => {
    const many = Array.from({ length: 6 }, (_, i) => cell(i, `s${i}`));
    const w = mountCockpit(
      many,
      0,
      many.map((_, i) => rosterRow(i)),
    );
    await nextTick();
    // The roster is a bounded flex-col scroll container...
    expect(w.get('[data-testid="cockpit"]').classes()).toContain("overflow-y-auto");
    // ...and each row refuses to shrink, so the list overflows (scrolls) rather than cramming.
    for (const row of w.findAll('[data-testid="cockpit-row"]')) expect(row.classes()).toContain("shrink-0");
  });

  // #1131: the row's status used to live only in an 8px dot and a 10px badge, on a bar painted with
  // the DIRECTORY's colour — so it was invisible at the scale you scan the list at. Asserting on the
  // row itself, and asserting that the row you are IN stays out of it: that blue ring already means
  // "you are here".
  it("marks a waiting row on the row itself, and leaves the expanded row alone", async () => {
    const w = mountCockpit([cell(0, "s0"), cell(1, "s1"), cell(2, "s2")], 0, [
      rosterRow(0, { status: "blocked" }), // expanded AND blocked — the expanded rule wins
      rosterRow(1, { status: "blocked" }),
      rosterRow(2, { status: "done" }),
    ]);
    await nextTick();
    const rows = w.findAll('[data-testid="cockpit-row"]');
    expect(rows[0].classes()).toContain("shadow-[0_0_0_2px_#4a9eff]");
    expect(rows[0].classes()).not.toContain("animate-roster-alert");
    expect(rows[1].classes()).toContain("animate-roster-alert");
    expect(rows[1].classes()).toContain("shadow-[0_0_0_2px_#f59e0b]");
    // The weak half of the split: finished is coloured, but it does not move.
    expect(rows[2].classes()).toContain("shadow-[0_0_0_2px_var(--done)]");
    expect(rows[2].classes()).not.toContain("animate-roster-alert");
  });

  it("emits toggle-expand when a NON-active row is clicked, and not for the active one", async () => {
    const w = mountCockpit([cell(0, "s0"), cell(1, "s1")], 0, [rosterRow(0), rosterRow(1)]);
    await nextTick();
    const rows = w.findAll('[data-testid="cockpit-row"]');
    await rows[1].trigger("click"); // uid 1, not the expanded (0)
    expect(w.emitted("toggle-expand")?.[0]).toEqual([1]);
    await rows[0].trigger("click"); // uid 0 IS the expanded one — no-op
    expect(w.emitted("toggle-expand")).toHaveLength(1);
  });

  it("falls back to the running program's label when a row has no prompt or summary", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { summary: null, prompt: null, fallback: "bash" })]);
    await nextTick();
    const lines = w.findAll('[data-testid="cockpit-line"]').map((l) => l.text());
    expect(lines.some((t) => t.includes("summary"))).toBe(false); // no summary line
    expect(lines.some((t) => t.includes("prompt") && t.includes("bash"))).toBe(true); // fallback in the prompt line
  });

  // The memo is the one line in a row the USER wrote; everything below it is what the agent said.
  // Asserting the ORDER, not just presence: reading it first is the whole point of the feature
  // (#1105), and a row that buries it under the agent's summary answers the wrong question.
  it("puts the user's memo above the summary, and omits the line when there is none", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { memo: "ship before the demo", summary: "Login fix", prompt: "fix login" })]);
    await nextTick();
    expect(w.get('[data-testid="cockpit-memo"]').text()).toContain("ship before the demo");
    const texts = w
      .get('[data-testid="cockpit-row"]')
      .findAll("span")
      .map((s) => s.text());
    const indexOf = (needle: string) => texts.findIndex((t) => t.includes(needle));
    expect(indexOf("ship before the demo")).toBeLessThan(indexOf("Login fix"));

    const bare = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { summary: "Login fix" })]);
    await nextTick();
    expect(bare.find('[data-testid="cockpit-memo"]').exists()).toBe(false);
  });

  // The memo must stay OUT of the clamped set: normalizeMemo already caps it at one line of 200
  // code points, and `cockpitLines` is the knob for agent text of no bounded length. A memo that
  // joined the clamped lines would also shift what the three configured counts land on.
  it("leaves the memo unclamped, so the configured counts still land on summary / prompt / reply", async () => {
    setCockpitLines({ summary: 6, prompt: 1, response: 9 });
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { memo: "mine", summary: "s", prompt: "p", response: "r" })]);
    await nextTick();
    expect(w.findAll('[data-testid="cockpit-line"]').map((l) => l.attributes("style"))).toEqual([
      "--cockpit-lines: 6;",
      "--cockpit-lines: 1;",
      "--cockpit-lines: 9;",
    ]);
    expect(w.get('[data-testid="cockpit-memo"]').classes()).not.toContain("line-clamp-[var(--cockpit-lines)]");
    setCockpitLines(undefined); // leave the singleton as the next test expects to find it
  });

  // The clamp is a runtime value, so it reaches the DOM as a CSS variable the Tailwind utility
  // reads. Asserting the variable (not a class) is what tells us config.json actually lands.
  it("clamps each roster line to the configured count, and reacts when the config arrives", async () => {
    setCockpitLines(undefined); // an unconfigured install
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { summary: "s", prompt: "p", response: "r" })]);
    await nextTick();
    const clampsOf = (wrapper: typeof w) => wrapper.findAll('[data-testid="cockpit-line"]').map((l) => l.attributes("style"));
    expect(clampsOf(w)).toEqual(["--cockpit-lines: 2;", "--cockpit-lines: 2;", "--cockpit-lines: 3;"]);
    for (const line of w.findAll('[data-testid="cockpit-line"]')) expect(line.classes()).toContain("line-clamp-[var(--cockpit-lines)]");

    // Hydration is async, so the already-mounted roster has to pick the new values up.
    setCockpitLines({ summary: 6, prompt: 1, response: 9 });
    await nextTick();
    expect(clampsOf(w)).toEqual(["--cockpit-lines: 6;", "--cockpit-lines: 1;", "--cockpit-lines: 9;"]);
    setCockpitLines(undefined); // leave the singleton as the next test expects to find it
  });

  // Truncation must never be the only way the text exists — the full line is one hover away.
  it("carries the untruncated text in a title", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { summary: "a long summary", prompt: "the prompt", response: "the reply" })]);
    await nextTick();
    expect(w.findAll('[data-testid="cockpit-line"]').map((l) => l.attributes("title"))).toEqual(["a long summary", "the prompt", "the reply"]);
  });

  it("renders a PR-phase badge with the phase label and class", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { phase: "ready" })]);
    await nextTick();
    const badge = w.find('[data-testid="cockpit-phase"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe("ready");
    expect(badge.classes()).toContain("ph-ready");
  });

  it("shows no phase badge for a cell with no PR yet (phase none)", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { phase: "none" })]);
    await nextTick();
    expect(w.find('[data-testid="cockpit-phase"]').exists()).toBe(false);
  });

  it("colours a row's header bar with its directory's configured header colour", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { headerColor: "#123456", headerTextColor: "#abcdef" })]);
    await nextTick();
    const header = w.find('[data-testid="cockpit-header"]').attributes("style") ?? "";
    expect(header).toContain("--cell-header-bg: #123456");
    expect(header).toContain("--cell-header-fg: #abcdef");
    // Only the header bar is tinted — the row body stays on the theme default.
    const row = w.find('[data-testid="cockpit-row"]').attributes("style") ?? "";
    expect(row).not.toContain("--cell-header-bg");
  });

  it("leaves the header bar transparent when its directory sets no header colour", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { headerColor: null, headerTextColor: null })]);
    await nextTick();
    const header = w.find('[data-testid="cockpit-header"]').attributes("style") ?? "";
    expect(header).not.toContain("--cell-header-bg");
  });

  it.each([
    ["planning", "planning"],
    ["implementing", "editing"],
  ] as const)("refines a working cell's status word to %s → %s", async (workPhase, word) => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { status: "working", workPhase })]);
    await nextTick();
    expect(w.find('[data-testid="cockpit-badge"]').text()).toBe(word);
  });

  it("shows the plain status word for a working cell whose sub-phase is unknown", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { status: "working", workPhase: null })]);
    await nextTick();
    expect(w.find('[data-testid="cockpit-badge"]').text()).toBe("running");
  });

  it("ignores workPhase for a non-working cell (idle stays idle)", async () => {
    const w = mountCockpit([cell(0, "s0")], 0, [rosterRow(0, { status: "idle", workPhase: "implementing" })]);
    await nextTick();
    expect(w.find('[data-testid="cockpit-badge"]').text()).toBe("idle");
  });
});

// The file pane splits the ENLARGED cell's room in two. The zoomed stage has two shapes —
// roster | terminal (list mode) and terminal / filmstrip (strip mode) — and the pane has to
// land beside the terminal in both, which is the whole reason it lives in a row wrapper
// rather than as another child of the stage.
describe("file pane beside the enlarged cell", () => {
  const paneOf = (w: ReturnType<typeof mount>) => w.findComponent({ name: "FilesPane" });
  // Idempotent: the open state persists, so a second mount in the same test may already
  // have it, and a blind toggle would close it.
  const openPane = async (w: ReturnType<typeof mount>) => {
    if (paneOf(w).exists()) return;
    await w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-files");
    await nextTick();
  };
  // The same for a cell that is NOT the enlarged one. Since #1378 each cell has its own answer,
  // so a test that walks the zoom has to say what the cell it walks TO has open — otherwise the
  // pane closes on arrival, which is the feature rather than a broken fixture.
  const openPaneOnCell = async (w: ReturnType<typeof mount>, index: number) => {
    await w.findAllComponents({ name: "TerminalCell" })[index].vm.$emit("toggle-files");
    await nextTick();
  };

  // The zoom FLIP asks for prefers-reduced-motion, which jsdom omits; these tests move the
  // enlargement, so they trip over it where the older ones never did.
  beforeEach(() => {
    localStorage.clear();
    paneStub.reload.mockClear();
    paneStub.flush.mockClear();
    paneStub.snapshot.mockClear();
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

  it("stays hidden until a cell is enlarged", async () => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    expect(paneOf(w).exists()).toBe(false); // closed by default
    await openPane(w);
    expect(paneOf(w).exists()).toBe(true);

    // Nothing zoomed: the row it lives in is hidden outright, pane and all.
    const flat = mountGrid([cell(1, "s1", "/proj")], null);
    expect(flat.find(".zoom-main").element.parentElement?.className).toContain("hidden");
  });

  it.each([
    ["list", true],
    ["strip", false],
  ])("puts the pane beside the enlarged terminal in %s mode", async (_name, listMode) => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, [], false, listMode);
    await openPane(w);
    const row = w.find(".zoom-main").element.parentElement;
    expect(row?.contains(paneOf(w).element)).toBe(true);
  });

  it("browses the enlarged cell's directory, falling back to the grid default", async () => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await openPane(w);
    expect(paneOf(w).props("cwd")).toBe("/proj");

    // A launcher / still-starting session has reported no cwd yet.
    const noCwd = mountCockpit([cell(1), cell(2)], 1, []);
    await openPane(noCwd);
    expect(paneOf(noCwd).props("cwd")).toBe("/work");
  });

  // The pane ignores its `cwd` prop by design, so asserting the prop alone would pass while the
  // tree still showed the previous cell — the host has to re-read, and that is what is checked.
  it("re-roots the one pane when the zoom moves to another cell", async () => {
    const cells = [cell(1, "s1", "/one"), cell(2, "s2", "/two")];
    const w = mountCockpit(cells, 1, []);
    await openPane(w);
    await openPaneOnCell(w, 1); // cell 2 wants one too, or arriving there would close it
    expect(w.findAllComponents({ name: "FilesPane" })).toHaveLength(1);
    expect(paneOf(w).props("cwd")).toBe("/one");
    expect(paneStub.reload).not.toHaveBeenCalled(); // it mounted on /one; nothing to re-read

    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(w.findAllComponents({ name: "FilesPane" })).toHaveLength(1);
    expect(paneOf(w).props("cwd")).toBe("/two");
    expect(paneStub.reload).toHaveBeenCalledTimes(1);
  });

  // The zoom moves from keys and filmstrip clicks; a dialog on each would interrupt the very
  // flow the pane sits beside. The buffer is saved on the way out instead — before the re-read,
  // or the save would race the tree it is being replaced by.
  it("saves the buffer before re-rooting, without asking", async () => {
    const w = mountCockpit([cell(1, "s1", "/one"), cell(2, "s2", "/two")], 1, []);
    await openPane(w);
    await openPaneOnCell(w, 1);
    const confirmSpy = vi.spyOn(window, "confirm");

    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(paneStub.flush).toHaveBeenCalledTimes(1);
    expect(paneStub.flush.mock.invocationCallOrder[0]).toBeLessThan(paneStub.reload.mock.invocationCallOrder[0]);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  // The header names the root the pane is on — label AND tooltip from the same value, or one
  // of them would quietly claim a different directory.
  it("names the root the pane is actually on", async () => {
    const w = mountCockpit([cell(1, "s1", "/one"), cell(2, "s2", "/two")], 1, []);
    await openPane(w);
    const label = w.find(".stub-files-pane span");
    expect(label.text()).toContain("one");
    expect(label.attributes("title")).toBe("/one");
  });

  // Closing unmounts the pane, buffer and all — so the toggle saves on the way out.
  it("saves before the header toggle closes the pane", async () => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await openPane(w);

    await w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-files");
    await flushPromises();
    expect(paneStub.flush).toHaveBeenCalledTimes(1);
    expect(paneOf(w).exists()).toBe(false);
  });

  // The pane's own close button has already flushed by the time it emits; flushing again here
  // would write the same buffer twice and rotate a backup generation for nothing.
  it("does not flush again when the pane itself reports it is closing", async () => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await openPane(w);
    paneStub.flush.mockClear();

    await paneOf(w).vm.$emit("close");
    await flushPromises();
    expect(paneStub.flush).not.toHaveBeenCalled();
    expect(paneOf(w).exists()).toBe(false);
  });

  // Collapsing the zoom only HIDES the row; the pane stays mounted, so an unsaved buffer is
  // still there when the cell is enlarged again. (Codex read this as an unguarded discard.)
  it("keeps the pane and its buffer mounted while the zoom is collapsed", async () => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await openPane(w);
    const before = paneOf(w).element;

    await w.setProps({ expandedUid: null });
    await flushPromises();
    expect(paneOf(w).exists()).toBe(true);
    expect(w.find(".zoom-main").element.parentElement?.className).toContain("hidden");

    await w.setProps({ expandedUid: 1 });
    await flushPromises();
    expect(paneOf(w).element).toBe(before); // same instance, never torn down
  });

  // Coming back to a terminal should not mean opening the same three directories again. Only
  // saved state is carried — the buffer went to disk (or the backup store) on the way out.
  it("hands a cell's remembered tree back when the zoom returns to it", async () => {
    const cells = [cell(1, "s1", "/one"), cell(2, "s2", "/two")];
    const w = mountCockpit(cells, 1, []);
    await openPane(w);
    await openPaneOnCell(w, 1);
    expect(paneOf(w).props("initialState")).toBeNull(); // never visited

    paneStub.snapshot.mockReturnValueOnce({ openPath: "notes.md", expanded: ["docs"] });
    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(paneOf(w).props("initialState")).toBeNull(); // cell 2 is new too

    await w.setProps({ expandedUid: 1 });
    await flushPromises();
    expect(paneOf(w).props("initialState")).toEqual({ openPath: "notes.md", expanded: ["docs"] });
  });

  // Two terminals in the same repository is the ordinary case here. Keying the pane on the
  // DIRECTORY left it bound to the cell it started on while the zoom moved to its neighbour —
  // so the neighbour's snapshot was filed under the first cell, and its own tree never arrived.
  it("re-roots and re-binds between two cells sharing a directory", async () => {
    const w = mountCockpit([cell(1, "s1", "/same"), cell(2, "s2", "/same")], 1, []);
    await openPane(w);
    await openPaneOnCell(w, 1);
    paneStub.snapshot.mockReturnValue({ openPath: "from-one.md", expanded: [] });

    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(paneStub.reload).toHaveBeenCalledTimes(1); // it moved, despite the same cwd
    expect(paneOf(w).props("initialState")).toBeNull(); // cell 2 has its own (empty) memory

    paneStub.snapshot.mockReturnValue({ openPath: "from-two.md", expanded: [] });
    await w.setProps({ expandedUid: 1 });
    await flushPromises();
    expect(paneOf(w).props("initialState")).toEqual({ openPath: "from-one.md", expanded: [] });
  });

  // #958: what survives a RELOAD. The uid-keyed memory above cannot — a cell is not the same
  // number next time — so a copy goes to localStorage keyed by directory, and is read only
  // when the memory has nothing.
  describe("restoring across a reload", () => {
    const seed = (cwd: string, state: { openPath: string | null; expanded: string[]; showPreview?: boolean }) =>
      localStorage.setItem("files_pane_state", JSON.stringify([{ cwd, state }]));

    beforeEach(() => localStorage.removeItem("files_pane_state"));

    // The view mode travels with the file (#2137): reading a `.md` in Preview is what the pane is
    // open for half the time, and the reload used to hand it back in the editor.
    it("hands the pane what this directory had open before the reload", async () => {
      seed("/one", { openPath: "notes.md", expanded: ["docs"], showPreview: true });
      const w = mountCockpit([cell(1, "s1", "/one"), cell(2)], 1, []);
      await openPane(w);
      expect(paneOf(w).props("initialState")).toEqual({ openPath: "notes.md", expanded: ["docs"], showPreview: true });
    });

    // The stored entry describes ONE pane, not a default for the directory. Two terminals in
    // the same repository is the ordinary case, and the second must start on its own empty
    // tree rather than inherit the first one's file — which is what a plain cwd lookup did.
    it("gives it to the first cell only, not to every cell sharing the directory", async () => {
      seed("/same", { openPath: "notes.md", expanded: [] });
      const w = mountCockpit([cell(1, "s1", "/same"), cell(2, "s2", "/same")], 1, []);
      await openPane(w);
      await openPaneOnCell(w, 1);
      expect(paneOf(w).props("initialState")).toEqual({ openPath: "notes.md", expanded: [], showPreview: false });

      paneStub.snapshot.mockReturnValue({ openPath: "from-one.md", expanded: [] });
      await w.setProps({ expandedUid: 2 });
      await flushPromises();
      expect(paneOf(w).props("initialState")).toBeNull();
    });

    // A terminal that changed directory is leaving that tree behind exactly as a zoom to another
    // cell does, so the snapshot has to be filed under the directory it is leaving — or coming
    // back to it restores whatever was there before, which is the wrong tree or none (Codex review).
    it("files the tree under the directory a cell is leaving when it cds", async () => {
      const cells = [cell(1, "s1", "/one"), cell(2)];
      const w = mountCockpit(cells, 1, []);
      await openPane(w);
      paneStub.snapshot.mockReturnValue({ openPath: "one.md", expanded: ["src"], showPreview: true });

      await w.setProps({ cells: [cell(1, "s1", "/two"), cell(2)] });
      await flushPromises();
      expect(paneOf(w).props("cwd")).toBe("/two");
      expect(JSON.parse(localStorage.getItem("files_pane_state") ?? "[]")).toEqual([
        { cwd: "/one", state: { openPath: "one.md", expanded: ["src"], showPreview: true } },
      ]);
    });

    it("ignores a directory it has nothing stored for", async () => {
      seed("/elsewhere", { openPath: "notes.md", expanded: [] });
      const w = mountCockpit([cell(1, "s1", "/one"), cell(2)], 1, []);
      await openPane(w);
      expect(paneOf(w).props("initialState")).toBeNull();
    });

    // Leaving the page is the moment this feature exists for, and nothing else snapshots then:
    // the state is otherwise written only when the pane closes or re-roots.
    it("writes what is on screen when the page goes away", async () => {
      const w = mountCockpit([cell(1, "s1", "/one"), cell(2)], 1, []);
      await openPane(w);
      paneStub.snapshot.mockReturnValue({ openPath: "live.md", expanded: ["src"], showPreview: true });

      window.dispatchEvent(new Event("pagehide"));
      await flushPromises();
      expect(JSON.parse(localStorage.getItem("files_pane_state") ?? "[]")).toEqual([
        { cwd: "/one", state: { openPath: "live.md", expanded: ["src"], showPreview: true } },
      ]);
    });
  });

  it("remembers across closing and re-opening the pane on the same cell", async () => {
    const w = mountCockpit([cell(1, "s1", "/one"), cell(2)], 1, []);
    await openPane(w);
    paneStub.snapshot.mockReturnValueOnce({ openPath: "a.md", expanded: [] });

    await w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-files");
    await flushPromises();
    await w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-files");
    await flushPromises();
    expect(paneOf(w).props("initialState")).toEqual({ openPath: "a.md", expanded: [] });
  });

  // A re-root that could not be saved out of never moved, so its snapshot belongs to the cell
  // the pane is STILL on — filing it under the cell it failed to reach would hand another
  // terminal a tree from somewhere else.
  it("files a snapshot under the cell the pane is actually on", async () => {
    const w = mountCockpit([cell(1, "s1", "/one"), cell(2, "s2", "/two")], 1, []);
    await openPane(w);
    await openPaneOnCell(w, 1);

    paneStub.flush.mockResolvedValueOnce(false as unknown as undefined);
    paneStub.snapshot.mockReturnValue({ openPath: "from-one.md", expanded: [] });
    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    expect(paneOf(w).props("cwd")).toBe("/one"); // stayed

    // Now let it move, and come back: cell 1 gets its own tree, cell 2 has none.
    paneStub.flush.mockResolvedValue(undefined);
    await w.setProps({ expandedUid: 1 }); // the zoom returns to where the pane already is
    await flushPromises();
    await w.setProps({ expandedUid: 2 }); // and moves again, this time successfully
    await flushPromises();
    expect(paneOf(w).props("cwd")).toBe("/two");
    expect(paneOf(w).props("initialState")).toBeNull();

    await w.setProps({ expandedUid: 1 });
    await flushPromises();
    expect(paneOf(w).props("initialState")).toEqual({ openPath: "from-one.md", expanded: [] });
  });

  // What survives a reload is keyed by SESSION (#1378): a uid is a different number next time,
  // and the pane is now that cell's rather than the grid's.
  it("remembers being open across a remount, and the pane's own close puts it away", async () => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await openPane(w);
    expect(JSON.parse(localStorage.getItem("pane_open_by_session") ?? "{}")).toEqual({ s1: "files" });

    // A reload: the same session, a uid it will not have again.
    const reopened = mountCockpit([cell(7, "s1", "/proj"), cell(8)], 7, []);
    await flushPromises();
    expect(paneOf(reopened).exists()).toBe(true);

    await paneOf(reopened).vm.$emit("close");
    await nextTick();
    expect(paneOf(reopened).exists()).toBe(false);
    expect(JSON.parse(localStorage.getItem("pane_open_by_session") ?? "{}")).toEqual({});
  });

  // The whole point of #1378: two cells, two answers, and walking the zoom shows each cell what
  // IT has open rather than carrying one pane across the grid.
  describe("one answer per cell", () => {
    it("starts closed on a cell that has never asked for a pane", async () => {
      const w = mountCockpit([cell(1, "s1", "/one"), cell(2, "s2", "/two")], 1, []);
      await openPane(w);
      expect(paneOf(w).exists()).toBe(true);

      await w.setProps({ expandedUid: 2 });
      await flushPromises();
      expect(paneOf(w).exists()).toBe(false); // cell 2 never asked
    });

    it("gives each cell back what it had, walking the zoom between them", async () => {
      const w = mountCockpit([cell(1, "s1", "/one"), cell(2, "s2", "/two")], 1, []);
      await openPane(w); // cell 1: files
      await w.findAllComponents({ name: "TerminalCell" })[1].vm.$emit("toggle-canvas"); // cell 2: canvas
      await flushPromises();
      expect(paneOf(w).exists()).toBe(true); // still cell 1's, which is the one enlarged

      await w.setProps({ expandedUid: 2 });
      await flushPromises();
      expect(paneOf(w).exists()).toBe(false);
      expect(w.findComponent({ name: "GuiPanel" }).exists()).toBe(true);

      await w.setProps({ expandedUid: 1 });
      await flushPromises();
      expect(paneOf(w).exists()).toBe(true);
      expect(w.findComponent({ name: "GuiPanel" }).exists()).toBe(false);
    });

    // A pane asked for while the grid is tiled is that cell's answer for when it IS enlarged —
    // which is the case the issue opens with (#1378): the canvas cannot open with nothing zoomed.
    it("opens on enlarging a cell whose pane was asked for while tiled", async () => {
      const w = mountCockpit([cell(1, "s1", "/one"), cell(2, "s2", "/two")], 1, []);
      await openPane(w);
      await w.setProps({ expandedUid: null });
      await flushPromises();

      await w.findAllComponents({ name: "TerminalCell" })[1].vm.$emit("toggle-canvas");
      await flushPromises();
      expect(paneOf(w).exists()).toBe(true); // the tiled press moved nothing: cell 1's pane stays

      await w.setProps({ expandedUid: 2 });
      await flushPromises();
      expect(w.findComponent({ name: "GuiPanel" }).exists()).toBe(true);
    });

    // Closing is an answer, not the absence of one — a reload must not hand the cell back a pane
    // it was told to put away.
    it("keeps a cell closed after the user closes it", async () => {
      const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
      await openPane(w);
      await w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-files");
      await flushPromises();

      const reopened = mountCockpit([cell(9, "s1", "/proj"), cell(10)], 9, []);
      await flushPromises();
      expect(paneOf(reopened).exists()).toBe(false);
    });
  });
});

// A remembered width was clamped against WHATEVER row existed when it was stored — a wider
// window, or the other zoom mode. Without a clamp at open time it is applied as-is, and a
// remembered 900px against a 1000px row leaves the terminal 100px wide (xterm reflow garbage).
describe("file pane width restored from storage", () => {
  // The roster splits the STAGE and the pane splits the row inside it (#1077), so the two widths
  // have to agree the way the real layout makes them agree: one stubbed width for every element
  // would have the roster and the pane dividing the same pixels, and the pane's numbers would be
  // measuring the roster's clamp instead of its own.
  const STAGE = 1400;
  const SEPARATOR = 5;
  const ROSTER = 360; // the width the roster starts at
  const ROW = STAGE - SEPARATOR - ROSTER;
  // A separator is flex-none and the pane keeps a 1px border even when squeezed to nothing, so
  // neither is the terminal's to spend.
  const PANE_ROOM = ROW - (SEPARATOR + 1);
  let clientWidth: PropertyDescriptor | undefined;
  beforeEach(() => {
    localStorage.clear();
    clientWidth = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "clientWidth");
    Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("stage") ? STAGE : ROW;
      },
    });
  });
  afterEach(() => {
    if (clientWidth) Object.defineProperty(window.HTMLElement.prototype, "clientWidth", clientWidth);
  });

  it("clamps to the terminal's floor as soon as the pane is on screen", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s1: "files" }));
    localStorage.setItem("files_pane_width", "900");
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await flushPromises();
    // 1000 wide, terminal keeps MIN_TERMINAL (320), the separator and border take PANE_CHROME →
    // the pane gets what is left.
    expect(w.findComponent({ name: "FilesPane" }).attributes("style")).toContain(`${PANE_ROOM - 320}px`);
  });

  // The single view's splitter announces its range; a screen-reader user resizing this one gets
  // nothing without the same three attributes.
  it("announces its value and range on the separator", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s1: "files" }));
    localStorage.setItem("files_pane_width", "400");
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await flushPromises();
    const sep = w.find('[role="separator"][aria-label="Resize side pane"]');
    expect(sep.attributes("aria-valuenow")).toBe("400");
    expect(sep.attributes("aria-valuemin")).toBe("360"); // MIN_GUI, there being room for it
    expect(sep.attributes("aria-valuemax")).toBe(String(PANE_ROOM - 320)); // the terminal keeps MIN_TERMINAL
  });

  it("leaves a width that already fits alone", async () => {
    localStorage.setItem("pane_open_by_session", JSON.stringify({ s1: "files" }));
    localStorage.setItem("files_pane_width", "400");
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await flushPromises();
    expect(w.findComponent({ name: "FilesPane" }).attributes("style")).toContain("400px");
  });
});

// Opening a file the user picked into the Canvas (#1374). The write is a round trip, and the zoom
// can move while it is in flight — the reply then belongs to a cell that is no longer on screen.
describe("open-in-canvas", () => {
  // Same reduced-motion stub the pane tests need: the zoom FLIP asks for it and jsdom omits it.
  beforeEach(() => {
    localStorage.clear();
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

  // One helper for the whole block: four fetch mocks were each declaring their own copy, which is
  // the duplication this repo's DRY rule is about (CodeRabbit read it as a redeclaration — it was
  // not, each sat in its own arrow-function scope, and `yarn typecheck` and the 68 tests here both
  // pass either way; the copies were still worth collapsing).
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

  // Only the WRITE is held open; the reads the grid makes on expand must settle as usual. The two
  // are told apart by the trailing `s`, not by a substring test — `/toolResults/<id>` CONTAINS
  // `/toolResult`, so a `.includes` here holds the read as well and the race under test never runs.
  const deferredWrite = () => {
    const held: Array<() => void> = [];
    globalThis.fetch = vi.fn(
      (url: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          const u = String(url);
          if (u.includes("/api/agent/toolResults/")) return resolve(ok({ toolResults: [] }));
          if (u.includes("/api/agent/toolResult")) return void held.push(() => resolve(ok({ ok: true })));
          resolve(ok({ tools: [] }));
        }),
    ) as unknown as typeof fetch;
    return () => held.forEach((r) => r());
  };

  const gridWithPaneOpen = async () => {
    const w = mountGrid([cell(1, "s-one", "/work/a"), cell(2, "s-two", "/work/b")], 1);
    await flushPromises();
    if (!w.findComponent({ name: "FilesPane" }).exists()) {
      await w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-files");
      await flushPromises();
    }
    return w;
  };

  // Awaited: the card is built before the write is even issued, so releasing the write any earlier
  // releases nothing and the test proves whatever the timing happened to be.
  const pickFile = async (w: ReturnType<typeof mount>) => {
    w.findComponent({ name: "FilesPane" }).vm.$emit("open-in-canvas", "design.md");
    await flushPromises();
  };

  it("shows the Canvas beside the cell the file was picked in", async () => {
    const release = deferredWrite();
    const w = await gridWithPaneOpen();
    await pickFile(w);
    release();
    await flushPromises();
    expect(w.find(".stub-gui-panel").exists()).toBe(true);
  });

  // The OTHER route that seeds a card and then asks for the Canvas: the header's `[Mulmo]` menu
  // (#1948), which seeds in Terminal.vue and emits `canvas`. On a cell that is ALREADY enlarged
  // nothing re-runs the watch that takes `canvasHasCard`, so the pane said "not enabled for this
  // session" over the card just written, and collapsing the cell and re-enlarging it was what
  // appeared to fix it (#1965).
  //
  // Asserted on the pane's own `unavailable` prop rather than on the panel existing: the panel
  // opens either way — carrying the message is the bug.
  it("shows a card seeded for the cell that is already enlarged, with no render MCP", async () => {
    let stored: unknown[] = [];
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/api/agent/toolResults/")) return Promise.resolve(ok({ toolResults: stored }));
      if (u.includes("/api/tools")) return Promise.resolve(ok({ groups: [] }));
      return Promise.resolve(ok({}));
    }) as unknown as typeof fetch;

    const w = mountGrid([cell(1, "s-one", "/work/a")], 1);
    await flushPromises();
    // The premise, both halves. The session has no canvas group AND the grid has been told so —
    // an unanswered `/api/tools` leaves `canvasChecked` false, and then the pane carries no
    // message whatever this flag says, which is a test that cannot fail.
    expect(w.findComponent({ name: "TerminalCell" }).props("canvasAvailable")).toBe(false);
    expect(w.findComponent({ name: "GuiPanel" }).exists()).toBe(false);

    // What the deck route has already done by the time it emits: the card is in the store.
    stored = [{ uuid: "u-1", toolName: "presentMulmoScript" }];
    w.findComponent({ name: "TerminalCell" }).vm.$emit("canvas");
    await flushPromises();

    expect(w.findComponent({ name: "GuiPanel" }).props("unavailable")).toBeNull();
  });

  // The cell moved on while the write was in flight. `canvasHasCard` is one flag for whichever
  // cell is enlarged, so a late reply would enable the SECOND cell's Canvas button on the strength
  // of a card written for the first — and pressing it opens a Canvas with nothing of its own in it.
  // A refusal is the server's sentence about the file that was clicked, and the reopen it comes
  // from is a round trip. Walk to another cell while it is in flight and the pane on screen is
  // rooted somewhere else — writing there names a file that tree is not showing (Codex on #1942).
  it("does not put a late refusal in the pane the user walked to", async () => {
    // The reopen answers a refusal, held until the zoom has moved.
    const held: Array<() => void> = [];
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/api/plugin/presentMulmoScript")) {
        return new Promise<Response>((resolve) => held.push(() => resolve(ok({ ok: false, code: "not_found", error: "File not found: stories/x.json" }))));
      }
      if (u.includes("/api/agent/toolResults/")) return Promise.resolve(ok({ toolResults: [] }));
      return Promise.resolve(ok({ tools: [] }));
    }) as unknown as typeof fetch;

    const w = await gridWithPaneOpen();
    // The grid must know a stories root, or nothing is a story and the refusal under test never
    // happens — the test would pass with the guard removed, which is how it read on the first try.
    await w.setProps({ storiesRoots: [{ id: "root-a", paths: ["/work/a"] }] });
    paneStub.showError.mockClear();
    w.findComponent({ name: "FilesPane" }).vm.$emit("open-in-canvas", "artifacts/stories/x.json");
    await flushPromises();
    // The reopen IS in flight. Without this the test passes when nothing was ever requested —
    // `showError` is not called either way, which is the shape of a test that cannot fail
    // (CodeRabbit on #1942).
    expect(held.length).toBeGreaterThan(0);

    // The zoom moves AND the new cell opens its own Files pane — the case that actually
    // misattributes. With no pane on the new cell there is nothing to write into, so the guard
    // would be untestable: the mutation would pass.
    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    const enlarged = w.findAllComponents({ name: "TerminalCell" }).find((c) => c.props("expanded"));
    if (!w.findComponent({ name: "FilesPane" }).exists()) {
      enlarged?.vm.$emit("toggle-files");
      await flushPromises();
    }
    expect(w.findComponent({ name: "FilesPane" }).exists()).toBe(true); // a pane IS on screen to mis-write into
    held.forEach((release) => release());
    await flushPromises();

    expect(paneStub.showError).not.toHaveBeenCalled();
  });

  // Same cell, same tree, but NOT the same pane: `v-if` unmounts the pane on close, so closing and
  // reopening while the reopen is in flight leaves a fresh instance at an identical uid and cwd.
  // A guard on those two alone reads that as "the pane that asked is still here" and writes a
  // sentence into a pane the user has since thrown away and rebuilt (Codex on #1942).
  it("does not put a late refusal in a pane that was closed and reopened", async () => {
    const held: Array<() => void> = [];
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/api/plugin/presentMulmoScript")) {
        return new Promise<Response>((resolve) => held.push(() => resolve(ok({ ok: false, code: "not_found", error: "File not found: stories/x.json" }))));
      }
      if (u.includes("/api/agent/toolResults/")) return Promise.resolve(ok({ toolResults: [] }));
      return Promise.resolve(ok({ tools: [] }));
    }) as unknown as typeof fetch;

    const w = await gridWithPaneOpen();
    await w.setProps({ storiesRoots: [{ id: "root-a", paths: ["/work/a"] }] });
    paneStub.showError.mockClear();
    const asked = w.findComponent({ name: "FilesPane" });
    asked.vm.$emit("open-in-canvas", "artifacts/stories/x.json");
    await flushPromises();
    expect(held.length).toBeGreaterThan(0); // the reopen IS in flight

    // Closed, then reopened on the SAME cell — the uid and the cwd are unchanged by design.
    asked.vm.$emit("close");
    await flushPromises();
    expect(w.findComponent({ name: "FilesPane" }).exists()).toBe(false);
    await w
      .findAllComponents({ name: "TerminalCell" })
      .find((c) => c.props("expanded"))
      ?.vm.$emit("toggle-files");
    await flushPromises();
    const reopened = w.findComponent({ name: "FilesPane" });
    expect(reopened.exists()).toBe(true);

    held.forEach((release) => release());
    await flushPromises();
    expect(paneStub.showError).not.toHaveBeenCalled();
  });

  // The positive half of the guard above, and the reason it is a separate test: the suppression one
  // asserts `showError` was NOT called, so a `showPaneError` that suppressed EVERYTHING would pass
  // it. Nothing at this level proved the sentence ever reaches the pane at all (Codex on #1942).
  it("puts the server's own sentence in the pane the file was picked in", async () => {
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      // Measured against the running server: an unresolvable deck answers 200 with its own sentence.
      if (u.includes("/api/plugin/presentMulmoScript")) return Promise.resolve(ok({ ok: false, code: "not_found", error: "File not found: stories/x.json" }));
      if (u.includes("/api/agent/toolResults/")) return Promise.resolve(ok({ toolResults: [] }));
      return Promise.resolve(ok({ tools: [] }));
    }) as unknown as typeof fetch;

    const w = await gridWithPaneOpen();
    await w.setProps({ storiesRoots: [{ id: "root-a", paths: ["/work/a"] }] });
    paneStub.showError.mockClear();
    w.findComponent({ name: "FilesPane" }).vm.$emit("open-in-canvas", "artifacts/stories/x.json");
    await flushPromises();

    // The SERVER's sentence, not a generic fallback: what makes the message worth showing is that
    // it names the file and says what to do about it (#1941).
    expect(paneStub.showError).toHaveBeenCalledWith("File not found: stories/x.json");
    expect(w.find(".stub-gui-panel").exists()).toBe(false); // and no Canvas was opened on a refusal
  });

  it("does not enable the Canvas button on the cell the zoom moved to", async () => {
    const release = deferredWrite();
    const w = await gridWithPaneOpen();
    await pickFile(w);
    await w.setProps({ expandedUid: 2 });
    await flushPromises();
    release();
    await flushPromises();
    const enlarged = w.findAllComponents({ name: "TerminalCell" }).find((c) => c.props("expanded"));
    expect(enlarged?.props("initialSessionId")).toBe("s-two");
    expect(enlarged?.props("canvasAvailable")).toBe(false);
  });
});

// The prompts pane's own behaviour has its own spec; what the GRID owes it is the wiring — the
// header button's event has to reach `toggleRightPane`, and the pane has to land in the row beside
// the enlarged terminal in both zoomed modes. A button whose event the grid does not map is dead
// and typechecks (#1573), which is why this is asserted rather than read. (CodeRabbit, #1749.)
describe("prompts pane beside the enlarged cell", () => {
  const paneOf = (w: ReturnType<typeof mount>) => w.findComponent({ name: "PromptsPane" });
  const togglePrompts = async (w: ReturnType<typeof mount>) => {
    await w.findComponent({ name: "TerminalCell" }).vm.$emit("toggle-prompts");
    await nextTick();
  };

  beforeEach(() => localStorage.clear());

  it.each([
    ["list", true],
    ["strip", false],
  ])("opens beside the enlarged terminal in %s mode", async (_name, listMode) => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, [], false, listMode);
    expect(paneOf(w).exists()).toBe(false);
    await togglePrompts(w);
    expect(paneOf(w).exists()).toBe(true);
    expect(w.find(".zoom-main").element.parentElement?.contains(paneOf(w).element)).toBe(true);
  });

  it("closes on the same button — it is the pane's only other close", async () => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await togglePrompts(w);
    await togglePrompts(w);
    expect(paneOf(w).exists()).toBe(false);
  });

  // Which log to read is decided from the CELL, so the pane cannot ask for the right one on its own.
  it("hands it the enlarged cell's session, directory and agent", async () => {
    const w = mountCockpit([{ uid: 1, session: "s1", cwd: "/proj", agent: "codex" }, cell(2)], 1, []);
    await togglePrompts(w);
    expect(paneOf(w).props("sessionId")).toBe("s1");
    expect(paneOf(w).props("cwd")).toBe("/proj");
    expect(paneOf(w).props("agent")).toBe("codex");
  });

  // Absent means Claude, the way a persisted cell encodes the default.
  it("reads a cell with no agent as claude", async () => {
    const w = mountCockpit([cell(1, "s1", "/proj"), cell(2)], 1, []);
    await togglePrompts(w);
    expect(paneOf(w).props("agent")).toBe("claude");
  });
});
