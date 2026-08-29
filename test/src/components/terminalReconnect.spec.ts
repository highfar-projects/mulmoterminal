// The manual way back once auto-reconnect has permanently given up on a slot (reconnectPolicy.ts:
// any exit/error/superseded frame sets sawExit, and nothing distinguishes "the devcontainer was
// rebuilt out from under this session" from any other clean exit — see the button's own comment in
// Terminal.vue). Before this, the only recovery was closing the cell and starting a fresh one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
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

const SLOT = "reconnect-spec";

const mountTerminal = (over: { command?: RunCommand } = {}) =>
  mount(Terminal, { props: { sessionId: "s-1", connectKey: 1, persistKey: SLOT, cwd: "/proj/reconnect-spec", ...over } });

const reconnectBtn = (w: ReturnType<typeof mountTerminal>) => w.find('[data-testid="term-reconnect"]');

beforeEach(() => {
  retargetMock.mockClear();
  connView.clear();
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
});

describe("Terminal.vue's reconnect button", () => {
  it("is absent while connected", () => {
    connView.set(SLOT, { status: "connected", serverCwd: "/proj/reconnect-spec" });
    const w = mountTerminal();
    expect(reconnectBtn(w).exists()).toBe(false);
  });

  it("is absent while still (auto-)connecting", () => {
    connView.set(SLOT, { status: "connecting", serverCwd: null });
    const w = mountTerminal();
    expect(reconnectBtn(w).exists()).toBe(false);
  });

  it("appears once disconnected — the state auto-reconnect can permanently give up in", () => {
    connView.set(SLOT, { status: "disconnected", serverCwd: null });
    const w = mountTerminal();
    expect(reconnectBtn(w).exists()).toBe(true);
  });

  it("retargets the SAME session/cwd on click — the same call a resumed session's connectKey watch already makes", async () => {
    connView.set(SLOT, { status: "disconnected", serverCwd: null });
    const w = mountTerminal();
    await reconnectBtn(w).trigger("click");
    expect(retargetMock).toHaveBeenCalledWith(SLOT, expect.objectContaining({ sessionId: "s-1", cwd: "/proj/reconnect-spec" }));
  });

  // A Run-menu script has no transcript to resume from — reconnecting could only ever find it
  // gone, so the button has to stay off for it even while disconnected.
  it("is absent for a running command, even while disconnected", () => {
    connView.set(SLOT, { status: "disconnected", serverCwd: null });
    const w = mountTerminal({ command: { source: "script", index: 0, label: "build", cwd: "/proj" } });
    expect(reconnectBtn(w).exists()).toBe(false);
  });
});
