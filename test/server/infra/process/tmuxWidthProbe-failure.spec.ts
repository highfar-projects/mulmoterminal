// @vitest-environment node
//
// measureTmuxWidths runs unawaited at boot, so a rejection would be unhandled and take the server
// down. Every way it can fail must come back as null and a log line instead.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LiveTmuxServer } from "../../../../server/infra/process/tmuxLiveServer.js";

const failures = vi.hoisted(() => ({ mkdtemp: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdtemp: async (prefix: string) => {
      if (failures.mkdtemp) throw new Error("ENOSPC: no space left on device");
      return actual.mkdtemp(prefix);
    },
  };
});
vi.mock("../../../../server/infra/process/spawnCapture.js", () => ({
  spawnCaptureAsync: vi.fn(async () => ({ status: 1, stdout: "", stderr: "tmux: not found" })),
}));

const { measureTmuxWidths, tmuxWidthTable } = await import("../../../../server/infra/process/tmuxWidthProbe.js");
const NO_LIVE_SERVER = async (): Promise<LiveTmuxServer> => ({ running: false });

describe("measureTmuxWidths when it cannot measure", () => {
  beforeEach(() => {
    failures.mkdtemp = false;
  });

  it("resolves to null and says so when no directory can be made", async () => {
    failures.mkdtemp = true;
    const log = vi.fn();
    await expect(measureTmuxWidths(log, NO_LIVE_SERVER)).resolves.toBeNull();
    expect(tmuxWidthTable()).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ENOSPC"));
  });

  it("resolves to null and says so when tmux will not start", async () => {
    const log = vi.fn();
    await expect(measureTmuxWidths(log, NO_LIVE_SERVER)).resolves.toBeNull();
    expect(tmuxWidthTable()).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("could not be measured"));
  });
});

describe("settledTmuxWidthTable", () => {
  it("answers at once when nothing is being measured", async () => {
    vi.resetModules();
    const fresh = await import("../../../../server/infra/process/tmuxWidthProbe.js");
    await expect(fresh.settledTmuxWidthTable(60_000)).resolves.toBeNull();
  });

  it("waits for a measurement still running, and gives up after the wait with what is known", async () => {
    const finishLiveCheck: ((live: LiveTmuxServer) => void)[] = [];
    const liveServer = () => new Promise<LiveTmuxServer>((resolve) => finishLiveCheck.push(resolve));
    const { measureTmuxWidths: measure, settledTmuxWidthTable: settled } = await import("../../../../server/infra/process/tmuxWidthProbe.js");
    const running = measure(() => undefined, liveServer);
    let waitedOut = false;
    await settled(10).then(() => (waitedOut = true));
    expect(waitedOut).toBe(true);
    const waiting = settled(60_000);
    finishLiveCheck.forEach((resolve) => resolve({ running: false }));
    await expect(waiting).resolves.toBe(await running);
  });
});
