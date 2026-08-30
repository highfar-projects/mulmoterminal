// The DELIBERATE counterpart to terminalReconnect.spec.ts's recovery button: a session that is
// perfectly healthy, but running against settings (.mcp.json among them) that an agent CLI only
// reads once, at its own process startup. Before this, the only way to pick up such a change was
// to close the cell and start a new one — losing the conversation's place in this terminal, even
// though the transcript itself was never actually lost.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import type { ConnStatus } from "../../../src/composables/useTerminalConnections";
import type { RunCommand } from "../../../src/components/runCommand";

const retargetMock = vi.fn();
const connView = reactive(new Map<string, { status: ConnStatus; serverCwd: string | null }>());

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

vi.mock("../../../src/composables/useTerminalConnections", () => ({
  connView,
  attach: () => {},
  setFont: () => {},
  setTheme: () => {},
  detach: () => {},
  release: () => {},
  retarget: retargetMock,
  terminate: () => {},
  fit: () => {},
  focus: () => {},
  insertText: () => {},
  sendView: () => {},
  readBuffer: () => null,
  submitText: () => true,
  isClaudeTarget: () => false,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// At module scope, not inside a test — see terminalViewInput.spec.ts's own note on why.
const Terminal = (await import("../../../src/components/Terminal.vue")).default;

const SLOT = "restart-spec";

const mountTerminal = (over: { command?: RunCommand; launcher?: { index: number } | { shell: true } | null; sessionId?: string | null } = {}) =>
  mount(Terminal, { props: { sessionId: "s-1", connectKey: 1, persistKey: SLOT, cwd: "/proj/restart-spec", ...over } });

const restartBtn = (w: ReturnType<typeof mountTerminal>) => w.find('[data-testid="term-restart"]');

/** `/api/session/:id/terminate` answers as usual, but held open until the test calls `finish` —
 *  the same shape as CellLaunchForm.spec.ts's mockHeldCreate, so a test can assert on the
 *  disabled/spinning button while the terminate request is still in flight. Terminal.vue makes
 *  several OTHER fetches on mount (session context, header, git status, …) — those pass straight
 *  through to the default mock so only the one call this test cares about is held. */
function mockHeldTerminate() {
  const calls: string[] = [];
  let resolve: (v: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
  const held = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((r) => (resolve = r));
  globalThis.fetch = vi.fn((url: string) => {
    const u = String(url);
    if (u.includes("/terminate")) {
      calls.push(u);
      return held;
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as unknown as typeof fetch;
  return { calls, finish: () => resolve({ ok: true, json: async () => ({}) }) };
}

beforeEach(() => {
  retargetMock.mockClear();
  connView.clear();
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
});

describe("Terminal.vue's restart button", () => {
  it("is absent while disconnected (that's Reconnect's job)", () => {
    connView.set(SLOT, { status: "disconnected", serverCwd: null });
    const w = mountTerminal();
    expect(restartBtn(w).exists()).toBe(false);
  });

  it("is absent while still connecting", () => {
    connView.set(SLOT, { status: "connecting", serverCwd: null });
    const w = mountTerminal();
    expect(restartBtn(w).exists()).toBe(false);
  });

  it("appears once connected, for a real session", () => {
    connView.set(SLOT, { status: "connected", serverCwd: "/proj/restart-spec" });
    const w = mountTerminal();
    expect(restartBtn(w).exists()).toBe(true);
  });

  it("is absent for a running command — no transcript to restart FOR", () => {
    connView.set(SLOT, { status: "connected", serverCwd: null });
    const w = mountTerminal({ command: { source: "script", index: 0, label: "build", cwd: "/proj" } });
    expect(restartBtn(w).exists()).toBe(false);
  });

  it("is absent for a launcher (plain shell) — nothing conversational to keep", () => {
    connView.set(SLOT, { status: "connected", serverCwd: null });
    const w = mountTerminal({ launcher: { shell: true } });
    expect(restartBtn(w).exists()).toBe(false);
  });

  it("is absent when there is no session id yet", () => {
    connView.set(SLOT, { status: "connected", serverCwd: null });
    const w = mountTerminal({ sessionId: null });
    expect(restartBtn(w).exists()).toBe(false);
  });

  it("does nothing when the user declines the confirm", async () => {
    connView.set(SLOT, { status: "connected", serverCwd: null });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { calls } = mockHeldTerminate();
    const w = mountTerminal();
    await restartBtn(w).trigger("click");
    expect(calls).toHaveLength(0);
    expect(retargetMock).not.toHaveBeenCalled();
  });

  it("terminates THIS session's id, then retargets the same session/cwd, once confirmed", async () => {
    connView.set(SLOT, { status: "connected", serverCwd: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { calls, finish } = mockHeldTerminate();
    const w = mountTerminal();
    await restartBtn(w).trigger("click");
    await flushPromises();
    expect(calls[0]).toContain("/api/session/s-1/terminate");
    expect(retargetMock).not.toHaveBeenCalled(); // not yet — the terminate is still in flight

    finish();
    await flushPromises();
    expect(retargetMock).toHaveBeenCalledWith(SLOT, expect.objectContaining({ sessionId: "s-1", cwd: "/proj/restart-spec" }));
  });

  it("disables the button and spins while the terminate request is in flight", async () => {
    connView.set(SLOT, { status: "connected", serverCwd: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { finish } = mockHeldTerminate();
    const w = mountTerminal();
    await restartBtn(w).trigger("click");
    await flushPromises();
    expect(restartBtn(w).attributes("disabled")).toBeDefined();

    finish();
    await flushPromises();
    expect(restartBtn(w).attributes("disabled")).toBeUndefined();
  });
});
