import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TerminalCell from "../../../src/components/TerminalCell.vue";
import { requestCellAction } from "../../../src/composables/useCellAction";

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

const hints: string[] = [];

// The stub records `connectKey`, which is the whole client half of a restart: bumping it is what
// retargets the slot at the same session id, and the server — with nothing live left to attach —
// spawns a new process that resumes the conversation. `header-actions` is rendered so the cell's
// own close button is in the DOM, which is how a test can close a cell mid-restart.
vi.mock("../../../src/components/Terminal.vue", () => ({
  default: {
    name: "TerminalView",
    props: ["sessionId", "connectKey", "cwd", "hideHeader", "launch", "customAgent", "agent"],
    emits: ["session", "cwd"],
    template: '<div class="stub-term"><slot name="header-actions" /></div>',
    methods: {
      terminate() {},
      showHint(message: string) {
        hints.push(message);
      },
    },
  },
}));

const TERMINATE_RE = /\/api\/session\/[^/?]+\/terminate$/;

let terminate: { resolve: (ended?: boolean) => void; calls: string[] };

beforeEach(() => {
  hints.length = 0;
  const calls: string[] = [];
  let release: (ended: boolean) => void = () => {};
  const pending = new Promise<boolean>((r) => (release = r));
  terminate = { resolve: (ended = true) => release(ended), calls };
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (TERMINATE_RE.test(u)) {
      calls.push(`${init?.method} ${u}`);
      // `ended` is the route's post-condition — it answers 200 either way — so a test drives THAT
      // rather than the status code.
      const ended = await pending; // held open, so a test can look at the world mid-restart
      return { ok: true, status: 200, json: async () => ({ ok: true, ended }) };
    }
    if (u.includes("/api/scripts")) return { ok: true, json: async () => ({ cwd: "/home/me/proj", scripts: [] }) };
    if (u.includes("/api/sessions")) return { ok: true, json: async () => ({ sessions: [] }) };
    return { ok: true, json: async () => ({ working: false, waiting: false, lastPrompt: null }) };
  }) as unknown as typeof fetch;
});

const mountCell = (initialSessionId: string | null) =>
  mount(TerminalCell, {
    props: {
      uid: 7,
      expanded: false,
      collectionsAvailable: false,
      zoomed: false,
      reorderable: false,
      initialSessionId,
      initialCwd: "/home/me/proj",
      defaultCwd: "/home/me/proj",
      presets: [],
      home: "/home/me",
      openSessionIds: [],
      openCwds: [],
    },
  });

const term = (w: ReturnType<typeof mountCell>) => w.findComponent({ name: "TerminalView" });

describe("restarting the agent in a cell", () => {
  it("reaps the session and only THEN reconnects the same id — the tmux race (#1918)", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    const before = Number(term(w).props("connectKey"));

    expect(requestCellAction("cell-7", "restart")).toBe(true);
    await flushPromises();

    // Mid-restart: the reap is in flight. Reconnecting here would hand `tmux new-session -A` a
    // session that is still alive, which ATTACHES the old process — a restart that changes nothing.
    expect(terminate.calls).toEqual(["POST /api/session/sess-1/terminate"]);
    expect(term(w).props("connectKey")).toBe(before);

    terminate.resolve();
    await flushPromises();
    expect(Number(term(w).props("connectKey"))).toBe(before + 1);
    // Same conversation, same cell: only the process was replaced.
    expect(term(w).props("sessionId")).toBe("sess-1");
    expect(hints).toEqual([]);
    w.unmount();
  });

  // The reap is a round trip and the cell can move on inside it. Reconnecting then retargets the
  // slot at whatever the cell holds NOW — and a just-launched session whose id the server has not
  // sent yet would be reconnected with no id at all, spawning a SECOND session (codex on #1920).
  it("does not reconnect a session the cell has moved on from", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    const before = Number(term(w).props("connectKey"));

    expect(requestCellAction("cell-7", "restart")).toBe(true);
    await flushPromises();
    term(w).vm.$emit("session", "sess-2"); // the cell is now on another session
    await flushPromises();
    const afterSwitch = Number(term(w).props("connectKey"));

    terminate.resolve();
    await flushPromises();
    expect(Number(term(w).props("connectKey"))).toBe(afterSwitch);
    expect(afterSwitch).toBe(before);
    w.unmount();
  });

  // The case codex named: closed and REUSED. The relaunched session has no id yet, so a stray
  // reconnect would go out with `sessionId: null` and start a second one, orphaning this.
  it("does not reconnect a cell that was closed and relaunched while the reap was in flight", async () => {
    const w = mountCell("sess-1");
    await flushPromises();

    expect(requestCellAction("cell-7", "restart")).toBe(true);
    await flushPromises();
    await w.find(".cell-close").trigger("click"); // back to the launch form
    await flushPromises();
    expect(term(w).exists()).toBe(false);

    await w.find('[data-testid="cell-chip-launch"]').trigger("click"); // start something else here
    await flushPromises();
    expect(term(w).props("sessionId")).toBeNull(); // brand new — the server has not named it yet
    const relaunched = Number(term(w).props("connectKey"));

    terminate.resolve();
    await flushPromises();
    expect(Number(term(w).props("connectKey"))).toBe(relaunched);
    w.unmount();
  });

  // A refused terminate leaves the old process in tmux. Reconnecting would attach it and redraw —
  // indistinguishable from a restart that worked, which is why the cell says so instead.
  it("says so, and reconnects nothing, when the session could not be ended", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    const before = Number(term(w).props("connectKey"));

    expect(requestCellAction("cell-7", "restart")).toBe(true);
    await flushPromises();
    terminate.resolve(false);
    await flushPromises();

    expect(Number(term(w).props("connectKey"))).toBe(before);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("restarted");
    w.unmount();
  });

  // Same window, the other half: a failed restart must not put its banner on the terminal that
  // replaced the one it was about — that agent was never restarted and has nothing to be told.
  it("says nothing to the terminal that replaced the one it was restarting", async () => {
    const w = mountCell("sess-1");
    await flushPromises();

    expect(requestCellAction("cell-7", "restart")).toBe(true);
    await flushPromises();
    await w.find(".cell-close").trigger("click");
    await flushPromises();
    await w.find('[data-testid="cell-chip-launch"]').trigger("click");
    await flushPromises();

    terminate.resolve(false);
    await flushPromises();
    expect(hints).toEqual([]);
    w.unmount();
  });

  // The Tools menu's entry is a third way in, and it works from a tile: a restart needs no room
  // beside the cell. It runs the same restart the other two reach.
  it("restarts from the Tools menu, on a tile", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    await w.find('[data-testid="cell-tools-btn"]').trigger("click");
    document.body.querySelector<HTMLButtonElement>('[data-testid="cell-pane-menu-restart"]')?.click();
    await flushPromises();
    expect(terminate.calls).toEqual(["POST /api/session/sess-1/terminate"]);
    terminate.resolve();
    await flushPromises();
    w.unmount();
  });

  it("offers no Tools menu on a tile before a session exists", async () => {
    const w = mountCell(null);
    await flushPromises();
    expect(w.find('[data-testid="cell-tools-btn"]').exists()).toBe(false);
    w.unmount();
  });

  it("declines for a cell that has no session, so the caller can say so", async () => {
    const w = mountCell(null);
    await flushPromises();
    expect(requestCellAction("cell-7", "restart")).toBe(false);
    expect(terminate.calls).toEqual([]);
    w.unmount();
  });

  it("is not reachable once the cell is gone", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    w.unmount();
    expect(requestCellAction("cell-7", "restart")).toBe(false);
  });
});

// The rest of what a `run: "action"` header button can ask of a cell (#2611). Panes and the launch
// panel belong to the grid, so the cell only passes them up; the timeline and talk are its own.
describe("the other header actions a cell answers", () => {
  it("passes a pane and new-here up to the grid", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    expect(requestCellAction("cell-7", "files")).toBe(true);
    expect(requestCellAction("cell-7", "canvas")).toBe(true);
    expect(requestCellAction("cell-7", "new-here")).toBe(true);
    expect(w.emitted("press-pane")).toEqual([["files"], ["canvas"]]);
    expect(w.emitted("new-here")).toEqual([[]]);
    w.unmount();
  });

  it("opens the timeline for a Claude session and declines without one", async () => {
    const empty = mountCell(null);
    await flushPromises();
    expect(requestCellAction("cell-7", "timeline")).toBe(false);
    empty.unmount();

    const w = mountCell("sess-1");
    await flushPromises();
    expect(requestCellAction("cell-7", "timeline")).toBe(true);
    w.unmount();
  });

  it("declines talk when there is no other terminal to talk to", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    expect(requestCellAction("cell-7", "talk")).toBe(false);
    w.unmount();
  });
});

// #2603: the launch panel on this cell's directory, by default, on row 2 beside the copy button.
describe("the row-2 new-here button", () => {
  it("asks the grid for the launch panel on this cell", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    await w.find('[data-testid="cell-new-here-btn"]').trigger("click");
    expect(w.emitted("new-here")).toEqual([[]]);
    w.unmount();
  });
});
