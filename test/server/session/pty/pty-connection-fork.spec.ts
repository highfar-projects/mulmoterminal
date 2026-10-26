// @vitest-environment node
// The fork's own pty-connection cases — the headless mirror that stands in for tmux on a non-tmux
// session, and psmux's tracked mouse modes. Kept apart from pty-connection.spec.ts so that file
// stays under max-lines and an upstream merge touches only its own cases.
import { describe, it, expect } from "vitest";
import { createConnectionHandlers } from "../../../../server/session/pty/pty-connection.js";
import type { PtyEntry } from "../../../../server/session/types.js";
import { TerminalModeTracker } from "../../../../server/session/pty/terminal-mode-tracker.js";

const OPEN = 1;
const SESSION = "11111111-2222-3333-4444-555555555555";

function fakeMirror() {
  const resizes: Array<[number, number]> = [];
  return {
    resizes,
    mirror: { feed: () => undefined, resize: (cols: number, rows: number) => resizes.push([cols, rows]), serialize: async () => "", dispose: () => undefined },
  };
}

function fakeSocket() {
  const sent: string[] = [];
  return {
    parsed: () => sent.map((s) => JSON.parse(s)),
    ws: { readyState: OPEN, OPEN, send: (d: string) => sent.push(d), close: () => undefined },
  };
}

function setup(terminalModes: readonly number[] = []) {
  const calls: string[] = [];
  const handlers = createConnectionHandlers({
    outputBufferLimit: 64 * 1024,
    cancelReap: () => undefined,
    reap: () => undefined,
    setWaiting: () => undefined,
    armReapForDetached: () => undefined,
    terminalModesOf: (id) => {
      calls.push(`terminalModes:${id}`);
      return terminalModes;
    },
    redrawTerminal: (id, clientPid) => calls.push(`redraw:${id}:${clientPid}`),
    redrawFromMirror: (id) => calls.push(`redrawMirror:${id}`),
    checkTerminalSize: () => undefined,
    recheckTerminalSize: () => undefined,
    cancelTerminalSizeCheck: () => undefined,
    checkPaneMode: () => undefined,
    exitCopyMode: () => undefined,
  });
  return { ...handlers, calls };
}

// PtyEntry carries fields these handlers never touch; the fakes model the ones they do.
function entryWith(over: Partial<PtyEntry> = {}) {
  const term = { pid: 4242, write: () => undefined, resize: () => undefined };
  return { term, ws: null, buffer: "", cwd: "/ws", active: false, agent: "claude", ...over } as unknown as PtyEntry;
}

describe("pty-connection on a non-tmux session with a headlessMirror", () => {
  // A session with no tmux has its own headlessMirror standing in for tmux's pane (#1073's
  // non-tmux gap — Windows has no tmux at all): the redraw goes to the mirror instead.
  it("redraws from the mirror instead of tmux, and keeps its size in step", () => {
    const { reattachPty, handleClientFrame, calls } = setup();
    const s = fakeSocket();
    const { mirror, resizes } = fakeMirror();
    const entry = entryWith({ buffer: "x", headlessMirror: mirror as never });
    reattachPty(entry, s.ws as never, SESSION);
    handleClientFrame(entry, s.ws as never, JSON.stringify({ type: "resize", cols: 100, rows: 30 }), SESSION);
    expect(resizes).toEqual([[100, 30]]);
    expect(calls.filter((c) => c.startsWith("redraw"))).toEqual([`redrawMirror:${SESSION}`]);
  });

  // A non-tmux entry with a mirror has just as stale a bounded-tail replay as a tmux one, so
  // it needs the same follow-up redraw — from its own mirror rather than tmux's pane.
  it("marks the session for redraw on reattach", () => {
    const { reattachPty } = setup();
    const s = fakeSocket();
    const { mirror } = fakeMirror();
    const entry = entryWith({ buffer: "x", headlessMirror: mirror as never });
    reattachPty(entry, s.ws as never, SESSION);
    expect(entry.redrawPending).toBe(true);
  });
});

describe("pty-connection on a psmux session", () => {
  // psmux answers only `alternate_on`; the mouse modes its client wrote come from the tracker, so the
  // browser gets the wheel back instead of arrow keys. Each mode once, tmux's answer first.
  it("adds the tracked mouse modes to tmux's answer", () => {
    const { reattachPty, calls } = setup([1049]);
    const s = fakeSocket();
    const tracker = new TerminalModeTracker();
    tracker.scan("\x1b[?1049h\x1b[?1003;1006h");
    reattachPty(entryWith({ buffer: "pane", tmux: true, modeTracker: tracker }), s.ws as never, SESSION);
    expect(calls).toContain(`terminalModes:${SESSION}`);
    const data = s.parsed()[0].data as string;
    expect(data.startsWith("\x1b[?1049h\x1b[?1003h\x1b[?1006h")).toBe(true);
    expect(data.split("\x1b[?1049h")).toHaveLength(2);
  });
});
