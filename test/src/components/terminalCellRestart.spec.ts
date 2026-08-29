import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TerminalCell from "../../../src/components/TerminalCell.vue";
import { requestCellRestart } from "../../../src/composables/useCellRestart";

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

// The stub records `connectKey`, which is the whole client half of a restart: bumping it is what
// retargets the slot at the same session id, and the server — with nothing live left to attach —
// spawns a new process that resumes the conversation.
vi.mock("../../../src/components/Terminal.vue", () => ({
  default: {
    name: "TerminalView",
    props: ["sessionId", "connectKey", "cwd", "hideHeader", "launch", "customAgent", "agent"],
    emits: ["session", "cwd"],
    template: '<div class="stub-term" />',
    methods: {
      terminate() {},
    },
  },
}));

const TERMINATE_RE = /\/api\/session\/[^/?]+\/terminate$/;

let terminate: { resolve: () => void; calls: string[] };

beforeEach(() => {
  const calls: string[] = [];
  let release = (): void => {};
  const pending = new Promise<void>((r) => (release = r));
  terminate = { resolve: () => release(), calls };
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (TERMINATE_RE.test(u)) {
      calls.push(`${init?.method} ${u}`);
      await pending; // held open, so a test can look at the world mid-restart
      return { ok: true, json: async () => ({ ok: true }) };
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

    expect(requestCellRestart("cell-7")).toBe(true);
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
    w.unmount();
  });

  it("declines for a cell that has no session, so the caller can say so", async () => {
    const w = mountCell(null);
    await flushPromises();
    expect(requestCellRestart("cell-7")).toBe(false);
    expect(terminate.calls).toEqual([]);
    w.unmount();
  });

  it("is not reachable once the cell is gone", async () => {
    const w = mountCell("sess-1");
    await flushPromises();
    w.unmount();
    expect(requestCellRestart("cell-7")).toBe(false);
  });
});
