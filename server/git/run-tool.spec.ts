// @vitest-environment node
import { describe, it, expect } from "vitest";
import { runTool } from "./run-tool";

// A child that starts a grandchild INHERITING its stdio, then sleeps. This is the shape that
// broke: `git status` → `sh` → `git-lfs filter-process`. Killing the child alone leaves the
// grandchild holding the stdout pipe, so `close` never fires and the caller waits forever on a
// call it already gave up on. The pid is printed so the test can check the grandchild really died.
const SPAWNS_A_GRANDCHILD = `
const { spawn } = require("node:child_process");
const g = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "inherit" });
console.log(g.pid);
setTimeout(() => {}, 60000);
`;

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// taskkill is asynchronous and the OS takes a moment to release the pid, so the assertion is
// "dies promptly", not "is dead on the next line".
async function waitForExit(pid: number, withinMs = 5000): Promise<boolean> {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

describe("runTool", () => {
  it("collects output and reports success", async () => {
    const res = await runTool(process.execPath, ["-e", "process.stdout.write('hi')"], { timeoutMs: 10_000 });
    expect(res).toMatchObject({ ok: true, stdout: "hi", timedOut: false });
  });

  it("reports a non-zero exit as not ok", async () => {
    const res = await runTool(process.execPath, ["-e", "process.exit(3)"], { timeoutMs: 10_000 });
    expect(res.ok).toBe(false);
    expect(res.timedOut).toBe(false);
  });

  it("keeps stderr only when asked, and drains it either way", async () => {
    const script = "process.stderr.write('boom')";
    const kept = await runTool(process.execPath, ["-e", script], { timeoutMs: 10_000, keepStderr: true });
    const dropped = await runTool(process.execPath, ["-e", script], { timeoutMs: 10_000 });
    expect(kept.stderr).toBe("boom");
    expect(dropped.stderr).toBe("");
    expect(dropped.ok).toBe(true);
  });

  it("resolves ok:false when the tool does not exist", async () => {
    const res = await runTool("mulmoterminal-no-such-tool", [], { timeoutMs: 10_000 });
    expect(res).toMatchObject({ ok: false, timedOut: false });
  });

  // The regression. Before the fix this never settled at all: vitest would fail on its own
  // timeout rather than on any assertion here.
  it("settles at the deadline even while a grandchild holds the pipes open", async () => {
    const started = Date.now();
    const res = await runTool(process.execPath, ["-e", SPAWNS_A_GRANDCHILD], { timeoutMs: 1000 });
    const elapsed = Date.now() - started;

    expect(res.timedOut).toBe(true);
    expect(res.ok).toBe(false);
    // Settled ON the deadline, not whenever the pipes happened to close.
    expect(elapsed).toBeLessThan(5000);

    const grandchild = Number(res.stdout.trim());
    expect(Number.isInteger(grandchild)).toBe(true);
    // The whole tree goes, not just the process we spawned — this is what stopped the
    // orphaned git-lfs helpers from accumulating.
    expect(await waitForExit(grandchild)).toBe(true);
  });
});
