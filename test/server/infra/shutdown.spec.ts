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
// `process.once` is spied rather than the real listeners diffed: the handlers call process.exit, so
// leaving one attached would end the test run, and the registration is the thing being asserted.
type OnceArgs = Parameters<typeof process.once>;

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

describe("installShutdownHandlers", () => {
  let registered: OnceArgs[] = [];

  beforeEach(() => {
    registered = [];
    stopWhisperSidecar.mockClear();
    vi.spyOn(process, "once").mockImplementation((...args: OnceArgs) => {
      registered.push(args);
      return process;
    });
    installShutdownHandlers();
  });

  afterEach(() => vi.restoreAllMocks());

  const listenerFor = (event: string): OnceArgs[1] | undefined => registered.find(([e]) => e === event)?.[1];

  it.each(SIGNALS)("takes over termination for %s", (signal) => {
    expect(registered.filter(([e]) => e === signal)).toHaveLength(1);
  });

  it("stops the sidecar on a normal return, where no signal is involved", () => {
    const onExit = listenerFor("exit");
    expect(onExit).toBeDefined();
    onExit?.(0);
    expect(stopWhisperSidecar).toHaveBeenCalledTimes(1);
  });

  it.each(SIGNALS)("kills the sidecar and exits 0 on %s, because the default exit is suppressed", (signal) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    listenerFor(signal)?.(signal);
    expect(stopWhisperSidecar).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("registers each of the three exactly once, so a second call cannot stack listeners", () => {
    expect(registered.map(([e]) => e)).toEqual(["exit", ...SIGNALS]);
  });
});
