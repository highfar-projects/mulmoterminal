// @vitest-environment node
//
// A psmux server outlives this process, so one started before Volta's marker was kept off its client
// still hands it to every new pane. The startup scrub has to take it from there too — and only there.
// tmux itself is replaced by a recorder.
import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { rmSync } from "node:fs";

const scratch = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const home = mkdtempSync(join(tmpdir(), "mt-psmuxscrub-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return { home };
});

const calls: string[][] = [];
let versionStdout = "";
vi.mock("../../../../server/infra/process/spawnCapture.js", () => ({
  spawnCapture: (_bin: string, args: string[]) => {
    calls.push(args);
    if (args[0] === "-V") return { status: 0, stdout: versionStdout, stderr: "" };
    if (args[2] === "show-environment") return { status: 0, stdout: "_VOLTA_TOOL_RECURSION=1\nHOME=/h\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  },
  spawnCaptureAsync: async () => ({ status: 0, stdout: "", stderr: "" }),
}));

afterAll(() => rmSync(scratch.home, { recursive: true, force: true }));
beforeEach(() => {
  calls.splice(0);
  vi.resetModules();
});

const startWith = async (stdout: string): Promise<void> => {
  versionStdout = stdout;
  const { tmuxAvailable } = await import("../../../../server/infra/process/tmux.js");
  expect(tmuxAvailable()).toBe(true);
};
const removed = (): string[] => calls.filter((args) => args[2] === "set-environment" && args[4] === "-r").map((args) => args[5] ?? "");

describe("the startup scrub of a running server", () => {
  it("takes Volta's marker from a running psmux", async () => {
    await startWith("tmux 3.4\npsmux 3.4.0 (abc)\n");
    expect(removed()).toContain("_VOLTA_TOOL_RECURSION");
  });

  it("leaves it on a running real tmux", async () => {
    await startWith("tmux 3.8\n");
    expect(removed()).not.toContain("_VOLTA_TOOL_RECURSION");
  });
});
