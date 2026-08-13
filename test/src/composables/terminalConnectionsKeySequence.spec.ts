import { describe, it, expect, vi, beforeEach } from "vitest";

// Same hoisting shape as terminalConnectionsSubmit.spec.ts — the xterm doubles are shared, and a
// `vi.mock` factory cannot close over an import of this file.
const { termState: mockTermState, keyState: mockKeyState } = await vi.hoisted(async () => (await import("../../helpers/xtermDouble")).createXtermState());

vi.mock("@xterm/xterm", async () => (await import("../../helpers/xtermDouble")).xtermModule(mockTermState, mockKeyState));
vi.mock("@xterm/addon-fit", async () => (await import("../../helpers/xtermDouble")).fitAddonModule());
vi.mock("@xterm/addon-web-links", async () => (await import("../../helpers/xtermDouble")).webLinksAddonModule());
vi.mock("@xterm/addon-clipboard", async () => (await import("../../helpers/xtermDouble")).clipboardAddonModule());
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import * as conn from "../../../src/composables/useTerminalConnections";
import { FakeWebSocket } from "../../helpers/xtermDouble";

const DOWN = "\x1b[B";
const ENTER = "\r";
const input = (data: string) => JSON.stringify({ type: "input", data });

// The keystrokes that answer an AskUserQuestion dialog (#1679) go out one at a time over ~300ms,
// which is long enough to cross a reconnect — `yarn dev` restarts the backend on every save. The
// rule under test is that the sequence belongs to the socket it STARTED on: half a sequence
// arriving at a replacement terminal walks that prompt's input history and submits what it found.
describe("sendKeySequence", () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  const target = (sessionId: string | null) => ({ sessionId, cwd: "/w", devTerminal: false, command: null, launcher: null });

  const openCell = (key: string) => {
    conn.attach(key, target("s1"), { onSession: vi.fn(), onCwd: vi.fn() }, document.createElement("div"));
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) throw new Error("no socket created");
    ws.onopen?.();
    ws.sent.length = 0; // drop init sends
    return ws;
  };

  it("sends every key, in order, to the cell's socket", async () => {
    const ws = openCell("cell-1");

    expect(await conn.sendKeySequence("cell-1", [DOWN, DOWN, ENTER], 0)).toBe(true);

    expect(ws.sent).toEqual([input(DOWN), input(DOWN), input(ENTER)]);
  });

  it("refuses a slot with no connection", async () => {
    expect(await conn.sendKeySequence("cell-nope", [ENTER], 0)).toBe(false);
  });

  it("stops when the socket closes partway, and says it did not finish", async () => {
    const ws = openCell("cell-2");
    const sequence = conn.sendKeySequence("cell-2", [DOWN, DOWN, ENTER], 1);
    ws.close();

    expect(await sequence).toBe(false);
    expect(ws.sent).not.toContain(input(ENTER)); // the committing key never went out
  });

  // The dangerous one: the cell is still there, but its socket has been replaced. Delivering the
  // rest of the keys would answer a dialog in a session that never asked.
  it("abandons the sequence when the cell reconnects onto a new socket", async () => {
    const first = openCell("cell-3");
    const sequence = conn.sendKeySequence("cell-3", [DOWN, DOWN, ENTER], 1);
    conn.retarget("cell-3", target("s2"));
    const second = FakeWebSocket.instances.at(-1);
    expect(second).not.toBe(first); // otherwise this test proves nothing about socket identity

    expect(await sequence).toBe(false);
    expect(second?.sent ?? []).not.toContain(input(ENTER));
    expect(first.sent).not.toContain(input(ENTER));
  });
});
