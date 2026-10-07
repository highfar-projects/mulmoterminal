// The rotation credential a cell shows (#2919): announced per process, replayed to a re-bound view,
// and forgotten the moment the cell points somewhere else.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { termState: mockTermState, keyState: mockKeyState } = await vi.hoisted(async () => (await import("../../helpers/xtermDouble")).createXtermState());

vi.mock("@xterm/xterm", async () => (await import("../../helpers/xtermDouble")).xtermModule(mockTermState, mockKeyState));
vi.mock("@xterm/addon-fit", async () => (await import("../../helpers/xtermDouble")).fitAddonModule());
vi.mock("@xterm/addon-web-links", async () => (await import("../../helpers/xtermDouble")).webLinksAddonModule());
vi.mock("@xterm/addon-clipboard", async () => (await import("../../helpers/xtermDouble")).clipboardAddonModule());
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import * as conn from "../../../src/composables/useTerminalConnections";
import type { CellCredential } from "../../../src/composables/cellCredential";
import { FakeWebSocket } from "../../helpers/xtermDouble";

const KEY = "cell-credential";
const target: conn.ConnTarget = { sessionId: "11111111-2222-4333-8444-555555555555", cwd: "/w", devTerminal: false, command: null, launcher: null };
const CREDENTIAL = JSON.stringify({ type: "credential", label: "SS", detail: "SS (me@example.com)" });

let seen: (CellCredential | null)[] = [];
const openCell = (): FakeWebSocket => {
  conn.attach(KEY, target, { onCredential: (credential) => seen.push(credential) }, document.createElement("div"));
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error("no socket created");
  ws.onopen?.();
  return ws;
};

describe("a cell's rotation credential", () => {
  beforeEach(() => {
    seen = [];
    FakeWebSocket.instances.length = 0;
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });
  afterEach(() => {
    conn.release(KEY);
    vi.unstubAllGlobals();
  });

  it("is handed to the view when the server announces it", () => {
    openCell().onmessage?.({ data: CREDENTIAL });
    expect(seen.at(-1)).toEqual({ label: "SS", detail: "SS (me@example.com)" });
  });

  it("is forgotten when the cell is pointed at another session, before any frame arrives", () => {
    openCell().onmessage?.({ data: CREDENTIAL });
    conn.retarget(KEY, { ...target, sessionId: null, cwd: "/elsewhere" });
    expect(seen.at(-1)).toBeNull();
  });

  it("is cleared by a frame that names none", () => {
    const ws = openCell();
    ws.onmessage?.({ data: CREDENTIAL });
    ws.onmessage?.({ data: JSON.stringify({ type: "credential", label: null }) });
    expect(seen.at(-1)).toBeNull();
  });
});
