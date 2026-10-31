// @vitest-environment node
// wireAgentPtyRelay is the exit path every agent cell and, since #3209, both shell ptys share — and
// nothing had run it: the three specs that name it mock it away. What it promises is small and
// breaks silently (a word in a log line, a frame arriving after the exit it belongs before), so each
// promise is pinned here against a pty whose events the spec fires and leaves that record their calls.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IDisposable, IPty } from "node-pty";
import { fakePty, fakePtyEntry } from "../../../helpers/fakePtyEntry";
import type { PtyEntry } from "../../../../server/session/types";

const ID = "44444444-5555-4666-8777-888888888888";
const T0 = 1_000_000;
const leaves: unknown[][] = [];
const logged: string[] = [];

vi.mock("../../../../server/session/pty/pty-exit.js", () => ({
  reportPtyExit: (...args: unknown[]) => {
    leaves.push(["reportPtyExit", ...args]);
    return "keep";
  },
}));
vi.mock("../../../../server/session/ws-frames.js", () => ({
  sendFrame: (_socket: unknown, payload: unknown) => {
    leaves.push(["sendFrame", payload]);
    return true;
  },
  sendExitAndClose: vi.fn(),
}));

const { wireAgentPtyRelay } = await import("../../../../server/session/pty/pty-relay.js");

const disposable: IDisposable = { dispose: () => {} };

/** A pty whose output and exit the spec raises itself. */
const livePty = () => {
  const onData: ((data: string) => void)[] = [];
  const onExit: ((exit: { exitCode: number; signal?: number }) => void)[] = [];
  const term: IPty = {
    ...fakePty(),
    onData: (listener) => {
      onData.push(listener);
      return disposable;
    },
    onExit: (listener) => {
      onExit.push(listener);
      return disposable;
    },
  };
  return {
    term,
    emit: (data: string) => onData.forEach((listener) => listener(data)),
    exit: (exit: { exitCode: number; signal?: number }) => onExit.forEach((listener) => listener(exit)),
  };
};

// Only read by the relay's `if (!entry.ws)`; sendFrame itself is recorded above.
const attachedSocket = () => ({ readyState: 1, send: () => {}, close: () => {} }) as unknown as PtyEntry["ws"];

const deps = { outputBufferLimit: 1000, reap: vi.fn() };
const exitLine = () => logged.find((line) => line.includes("exited"));

describe("wireAgentPtyRelay", () => {
  beforeEach(() => {
    leaves.length = 0;
    logged.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(String(args[0]));
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs the exit under the entry's agent", () => {
    const pty = livePty();
    wireAgentPtyRelay(fakePtyEntry({ term: pty.term, agent: "codex" }), ID, T0, deps);
    pty.exit({ exitCode: 0 });
    expect(exitLine()).toContain("[pty] codex exited code=0");
  });

  // A shell pty records `shell` for the phone, but its start line said `launcher`, and the exit line
  // is read beside it.
  it("logs it under loggedAs when the entry's word is not the one to print", () => {
    const pty = livePty();
    wireAgentPtyRelay(fakePtyEntry({ term: pty.term, agent: "shell" }), ID, T0, deps, { loggedAs: "launcher" });
    pty.exit({ exitCode: 0 });
    expect(exitLine()).toContain("[pty] launcher exited");
    expect(exitLine()).not.toContain("shell");
  });

  // Idle output goes out at once; a second chunk inside the batch window waits for the timer. An exit
  // before that timer must send the chunk first, or the browser sees the exit and then more output.
  it("flushes what is still queued before reporting the exit", () => {
    const pty = livePty();
    wireAgentPtyRelay(fakePtyEntry({ term: pty.term, ws: attachedSocket() }), ID, T0, deps);
    pty.emit("sent at once");
    pty.emit("queued");
    pty.exit({ exitCode: 0 });
    expect(leaves.map((leaf) => leaf[0])).toEqual(["sendFrame", "sendFrame", "reportPtyExit"]);
    expect(leaves[1]?.[1]).toEqual({ type: "output", data: "queued" });
  });

  it("hands reportPtyExit the session, the entry, the lifetime since spawn and the reap", () => {
    const pty = livePty();
    const entry = fakePtyEntry({ term: pty.term });
    wireAgentPtyRelay(entry, ID, T0 - 2_000, deps);
    vi.advanceTimersByTime(500);
    pty.exit({ exitCode: 3, signal: 15 });
    expect(leaves).toEqual([["reportPtyExit", ID, entry, { exitCode: 3, signal: 15, lifetimeMs: 2_500 }, deps.reap]]);
    expect(exitLine()).toContain("after 2.5s");
  });

  it("feeds onOutput the chunks it buffers", () => {
    const pty = livePty();
    const entry = fakePtyEntry({ term: pty.term });
    const seen: string[] = [];
    wireAgentPtyRelay(entry, ID, T0, deps, { onOutput: (data) => seen.push(data) });
    pty.emit("a");
    pty.emit("b");
    expect(seen).toEqual(["a", "b"]);
    expect(entry.buffer).toBe("ab");
  });
});
