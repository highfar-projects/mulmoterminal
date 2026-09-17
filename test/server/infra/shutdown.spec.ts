// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock is hoisted above every const in the file, so the spy has to be hoisted with it.
const { stopWhisperSidecar } = vi.hoisted(() => ({ stopWhisperSidecar: vi.fn() }));
vi.mock("../../../server/backends/whisper.js", () => ({ stopWhisperSidecar }));

import { installShutdownHandlers } from "../../../server/infra/shutdown.js";

// Registering a signal listener is what SUPPRESSES Node's own termination, so a signal this module
// forgets is a MulmoTerminal that no longer dies from Ctrl+C. That failure is invisible to every
// other test — nothing else sends the process a signal — which is the reason for this file.
//
// `process.once` / `process.on` are spied rather than the real listeners diffed: the handlers call
// process.exit, so leaving one attached would end the test run, and the registration is the thing
// being asserted. The IPC "message" listener uses `.on` (see shutdown.ts's own comment on why),
// so it needs its own capture — invoking it directly is also the only way to reach it without
// actually wiring up a `message` event on this test's own process.
type OnceArgs = Parameters<typeof process.once>;
type OnArgs = Parameters<typeof process.on>;

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

describe("installShutdownHandlers", () => {
  let registered: OnceArgs[] = [];
  let onRegistered: OnArgs[] = [];
  let pendingWrites: ReturnType<typeof vi.fn<() => Promise<unknown>[]>>;

  beforeEach(() => {
    registered = [];
    onRegistered = [];
    stopWhisperSidecar.mockClear();
    pendingWrites = vi.fn(() => []);
    vi.spyOn(process, "once").mockImplementation((...args: OnceArgs) => {
      registered.push(args);
      return process;
    });
    vi.spyOn(process, "on").mockImplementation((...args: OnArgs) => {
      onRegistered.push(args);
      return process;
    });
    installShutdownHandlers(pendingWrites);
  });

  afterEach(() => vi.restoreAllMocks());

  const listenerFor = (event: string): OnceArgs[1] | undefined => registered.find(([e]) => e === event)?.[1];
  const onListenerFor = (event: string): OnArgs[1] | undefined => onRegistered.find(([e]) => e === event)?.[1];

  it.each(SIGNALS)("takes over termination for %s", (signal) => {
    expect(registered.filter(([e]) => e === signal)).toHaveLength(1);
  });

  it("stops the sidecar on a normal return, where no signal is involved", () => {
    const onExit = listenerFor("exit");
    expect(onExit).toBeDefined();
    onExit?.(0);
    expect(stopWhisperSidecar).toHaveBeenCalledTimes(1);
  });

  it.each(SIGNALS)("kills the sidecar and exits 0 on %s, because the default exit is suppressed", async (signal) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    listenerFor(signal)?.(signal);
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(stopWhisperSidecar).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  // registry.ts's fire-and-forget appenders (session→account, session→custom-agent, …) queue a
  // write and return before it lands — the whole reason this function exists (#579-adjacent): a
  // signal that exits immediately abandons whatever was still mid-append, and the next boot's
  // hydration has nothing to read back for it.
  it.each(SIGNALS)("waits for pending registry writes to land before exiting, on %s", async (signal) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    let resolveWrite!: () => void;
    // Same `pendingWrites` reference the handler already closed over in beforeEach — swapping its
    // implementation reaches the installed listener without a second install() stacking a listener
    // `listenerFor` would never reach (`.find` returns the first).
    pendingWrites.mockImplementation(() => [new Promise<void>((r) => (resolveWrite = r))]);

    listenerFor(signal)?.(signal);
    await Promise.resolve(); // let the signal handler's synchronous part run
    expect(exit).not.toHaveBeenCalled();

    resolveWrite();
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
  });

  it("registers each of the three exactly once, so a second call cannot stack listeners", () => {
    expect(registered.map(([e]) => e)).toEqual(["exit", ...SIGNALS]);
  });

  // A supervisor (scripts/dev-server.mjs, bin/mulmoterminal.js) sends this over the IPC channel it
  // already has when it cannot deliver a real signal — which on Windows is always, since
  // child_process.kill() there has no SIGTERM to send and TerminateProcess()es the target outright.
  describe("the IPC shutdown message", () => {
    it("runs the identical graceful-exit path a real signal does", async () => {
      const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      onListenerFor("message")?.({ type: "shutdown" }, undefined);
      await vi.waitFor(() => expect(exit).toHaveBeenCalled());
      expect(stopWhisperSidecar).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(0);
    });

    it("waits for pending writes before exiting, same as a real signal", async () => {
      const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      let resolveWrite!: () => void;
      pendingWrites.mockImplementation(() => [new Promise<void>((r) => (resolveWrite = r))]);

      onListenerFor("message")?.({ type: "shutdown" }, undefined);
      await Promise.resolve();
      expect(exit).not.toHaveBeenCalled();

      resolveWrite();
      await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    });

    it("ignores any other message on the same channel", () => {
      const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      onListenerFor("message")?.({ type: "listening", port: 34567 }, undefined);
      onListenerFor("message")?.("not even a record", undefined);
      expect(exit).not.toHaveBeenCalled();
    });

    it("is registered with `.on`, not `.once`, so more than one channel message can be read", () => {
      expect(onRegistered.filter(([e]) => e === "message")).toHaveLength(1);
    });
  });
});
