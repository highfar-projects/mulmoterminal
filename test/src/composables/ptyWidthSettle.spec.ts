import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Same doubles as the sibling connection specs (test/helpers/xtermDouble.ts), with one addition:
// every Terminal the manager builds is recorded, so a test can move its cols the way FitAddon.fit()
// would on a real host — the double's fit() leaves the size alone.
const { termState: mockTermState, keyState: mockKeyState } = await vi.hoisted(async () => (await import("../../helpers/xtermDouble")).createXtermState());
const builtTerms = vi.hoisted(() => [] as { cols: number; rows: number }[]);

vi.mock("@xterm/xterm", async () => {
  const { Terminal } = (await import("../../helpers/xtermDouble")).xtermModule(mockTermState, mockKeyState);
  class RecordedTerminal extends Terminal {
    constructor(opts: Record<string, unknown>) {
      super(opts);
      builtTerms.push(this);
    }
  }
  return { Terminal: RecordedTerminal };
});
vi.mock("@xterm/addon-fit", async () => (await import("../../helpers/xtermDouble")).fitAddonModule());
vi.mock("@xterm/addon-web-links", async () => (await import("../../helpers/xtermDouble")).webLinksAddonModule());
vi.mock("@xterm/addon-clipboard", async () => (await import("../../helpers/xtermDouble")).clipboardAddonModule());
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import * as conn from "../../../src/composables/useTerminalConnections";
import { PTY_WIDTH_SETTLE_MS, widthSettleStep } from "../../../src/composables/ptyWidthSettle";
import { FakeWebSocket } from "../../helpers/xtermDouble";

// #2943: every width change the pty sees adds a copy of a Claude cell's screen to the tmux history,
// so a new width is sent only once it has stopped changing. The rule is pinned first, then the
// wiring — the frames that actually reach the socket.

describe("widthSettleStep", () => {
  it("sends at once when nothing has been sent over this socket yet", () => {
    expect(widthSettleStep(null, 120).kind).toBe("send-now");
  });

  // Height-only changes and same-size re-sends: the second is the server's repair path for a tmux
  // window that fell out of step, so it must never be held back.
  it("sends at once when the width is the one already sent", () => {
    expect(widthSettleStep(120, 120).kind).toBe("send-now");
  });

  it("waits when the width changed", () => {
    expect(widthSettleStep(120, 100).kind).toBe("wait");
  });
});

const KEY = "cell-width-settle";
const target = { sessionId: null, cwd: "/w", devTerminal: false, command: null, launcher: null };
const resizeFrames = (ws: FakeWebSocket) => ws.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "resize");

describe("resize frames while the width changes", () => {
  let ws: FakeWebSocket;
  let term: { cols: number; rows: number };

  const resizeTo = (cols: number, rows = term.rows): void => {
    term.cols = cols;
    term.rows = rows;
    conn.fit(KEY);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances.length = 0;
    builtTerms.length = 0;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    conn.attach(KEY, target, {}, document.createElement("div"));
    const sock = FakeWebSocket.instances.at(-1);
    const built = builtTerms.at(-1);
    if (!sock || !built) throw new Error("attach built no socket or terminal");
    ws = sock;
    term = built;
    ws.onopen?.();
    // attach() refits once more on the next animation frame; let it land before counting.
    vi.advanceTimersByTime(PTY_WIDTH_SETTLE_MS * 2);
    ws.sent.length = 0; // the frames attach() and onopen produced are not what these tests are about
  });
  afterEach(() => {
    conn.release(KEY);
    vi.useRealTimers();
  });

  it("holds a new width until it settles, then sends the size the terminal has", () => {
    resizeTo(100);
    expect(resizeFrames(ws)).toHaveLength(0);

    vi.advanceTimersByTime(PTY_WIDTH_SETTLE_MS);
    expect(resizeFrames(ws)).toEqual([{ type: "resize", cols: 100, rows: 24 }]);
  });

  // The window-edge drag: one frame per ResizeObserver delivery used to reach the pty.
  it("sends only the last width of a drag", () => {
    for (const cols of [78, 76, 74, 72]) {
      resizeTo(cols);
      vi.advanceTimersByTime(PTY_WIDTH_SETTLE_MS / 3);
    }
    expect(resizeFrames(ws)).toHaveLength(0);

    vi.advanceTimersByTime(PTY_WIDTH_SETTLE_MS);
    expect(resizeFrames(ws)).toEqual([{ type: "resize", cols: 72, rows: 24 }]);
  });

  it("costs nothing when the drag ends at the width it started from", () => {
    resizeTo(70);
    resizeTo(80);
    vi.advanceTimersByTime(PTY_WIDTH_SETTLE_MS * 2);

    // Back at the width already sent, so it went at once as a plain re-send — and the pending 70
    // never followed it.
    expect(resizeFrames(ws)).toEqual([{ type: "resize", cols: 80, rows: 24 }]);
  });

  it("sends a height-only change at once", () => {
    resizeTo(80, 30);
    expect(resizeFrames(ws)).toEqual([{ type: "resize", cols: 80, rows: 30 }]);
  });

  it("drops the pending send when the slot is torn down", () => {
    resizeTo(100);
    conn.release(KEY);
    vi.advanceTimersByTime(PTY_WIDTH_SETTLE_MS * 2);
    expect(resizeFrames(ws)).toHaveLength(0);
  });

  it("does not carry a pending width over to a new socket", () => {
    resizeTo(100);
    ws.onclose?.();
    vi.runOnlyPendingTimers(); // the reconnect fires, and with it any stale settle timer
    const next = FakeWebSocket.instances.at(-1);
    if (!next || next === ws) throw new Error("no reconnect");
    next.onopen?.();

    // The new socket is told the current size on open, once.
    expect(resizeFrames(next)).toEqual([{ type: "resize", cols: 100, rows: 24 }]);
    vi.advanceTimersByTime(PTY_WIDTH_SETTLE_MS * 2);
    expect(resizeFrames(next)).toHaveLength(1);
  });
});
