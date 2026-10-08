import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// submitText and pasteAndSubmit share one body: write the text, then the submit byte after a delay,
// both pinned to the socket captured at the call. These pin what that body owes BOTH entry points;
// the bytes each one writes are pinned in terminalConnectionsSubmit.spec.ts.
const { termState: mockTermState, keyState: mockKeyState } = await vi.hoisted(async () => (await import("../../helpers/xtermDouble")).createXtermState());

vi.mock("@xterm/xterm", async () => (await import("../../helpers/xtermDouble")).xtermModule(mockTermState, mockKeyState));
vi.mock("@xterm/addon-fit", async () => (await import("../../helpers/xtermDouble")).fitAddonModule());
vi.mock("@xterm/addon-web-links", async () => (await import("../../helpers/xtermDouble")).webLinksAddonModule());
vi.mock("@xterm/addon-clipboard", async () => (await import("../../helpers/xtermDouble")).clipboardAddonModule());
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import * as conn from "../../../src/composables/useTerminalConnections";
import { FakeWebSocket } from "../../helpers/xtermDouble";

const KEY = "cell-wts";
const target: conn.ConnTarget = { sessionId: null, cwd: "/typed", devTerminal: false, command: null, launcher: null };
const SUBMIT = JSON.stringify({ type: "input", data: "\r" });
const PATHS = [
  { name: "submitText", send: conn.submitText, delayMs: 60 },
  { name: "pasteAndSubmit", send: conn.pasteAndSubmit, delayMs: 200 },
] as const;

const openCell = (): FakeWebSocket => {
  conn.attach(KEY, target, { onSession: vi.fn(), onCwd: vi.fn() }, document.createElement("div"));
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error("no socket created");
  ws.onopen?.();
  ws.sent.length = 0;
  return ws;
};

describe.each(PATHS)("$name: the delayed submit", ({ send, delayMs }) => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances.length = 0;
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });
  afterEach(() => {
    conn.release(KEY);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("follows the text after its own delay, not before", () => {
    const ws = openCell();
    expect(send(KEY, "hello")).toBe(true);
    vi.advanceTimersByTime(delayMs - 1);
    expect(ws.sent).not.toContain(SUBMIT);
    vi.advanceTimersByTime(1);
    expect(ws.sent.at(-1)).toBe(SUBMIT);
  });

  // The old socket can still read OPEN while the slot has moved on (a real close() only reaches
  // CLOSING), so the readyState check alone would submit into it.
  it("sends no stray submit to a slot that reconnected before it fired", () => {
    const old = openCell();
    expect(send(KEY, "hello")).toBe(true);
    conn.retarget(KEY, { ...target, cwd: "/elsewhere" });
    old.readyState = FakeWebSocket.OPEN;
    const fresh = FakeWebSocket.instances.at(-1);
    vi.advanceTimersByTime(delayMs);
    expect(old.sent).not.toContain(SUBMIT);
    expect(fresh?.sent ?? []).not.toContain(SUBMIT);
  });

  it("sends no submit once its socket has closed", () => {
    const ws = openCell();
    expect(send(KEY, "hello")).toBe(true);
    ws.close();
    vi.advanceTimersByTime(delayMs);
    expect(ws.sent).not.toContain(SUBMIT);
  });
});
