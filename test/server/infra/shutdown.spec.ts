// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock is hoisted above every const in the file, so the spy has to be hoisted with it.
const { stopWhisperSidecar } = vi.hoisted(() => ({ stopWhisperSidecar: vi.fn() }));
vi.mock("../../../server/backends/whisper.js", () => ({ stopWhisperSidecar }));

import { installShutdownHandlers } from "../../../server/infra/shutdown.js";

// Registering a signal listener is what SUPPRESSES Node's own termination, so a signal this
// module forgets is a MulmoTerminal that no longer dies from Ctrl+C. That failure is invisible to
// every other test — nothing else sends the process a signal — which is the reason for this file.
const SIGNALS = ["SIGINT", "SIGTERM"] as const;

type Listener = (...args: never[]) => void;
const listenersOf = (event: "exit" | (typeof SIGNALS)[number]): Listener[] => [...process.listeners(event)] as Listener[];

describe("installShutdownHandlers", () => {
  let added: { event: "exit" | (typeof SIGNALS)[number]; fn: Listener }[] = [];

  beforeEach(() => {
    stopWhisperSidecar.mockClear();
    const before = new Map((["exit", ...SIGNALS] as const).map((e) => [e, listenersOf(e)]));
    installShutdownHandlers();
    added = (["exit", ...SIGNALS] as const).flatMap((event) =>
      listenersOf(event)
        .filter((fn) => !before.get(event)?.includes(fn))
        .map((fn) => ({ event, fn })),
    );
  });

  // The handlers are real and would end the test run; take them back off whatever the assertions did.
  afterEach(() => added.forEach(({ event, fn }) => process.removeListener(event, fn)));

  it.each(SIGNALS)("takes over termination for %s", (signal) => {
    expect(added.filter((a) => a.event === signal)).toHaveLength(1);
  });

  it("stops the sidecar on a normal return, where no signal is involved", () => {
    const onExit = added.find((a) => a.event === "exit");
    expect(onExit).toBeDefined();
    onExit?.fn();
    expect(stopWhisperSidecar).toHaveBeenCalledTimes(1);
  });

  it.each(SIGNALS)("kills the sidecar and exits 0 on %s, because the default exit is suppressed", (signal) => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    added.find((a) => a.event === signal)?.fn();
    expect(stopWhisperSidecar).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    exit.mockRestore();
  });
});
