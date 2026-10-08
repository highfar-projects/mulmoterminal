// @vitest-environment node
//
// #2935: Node's `timeout` signals the direct child only, and `close` waits for every holder of the
// pipes. A grandchild that inherited stdout (git-lfs `filter-process` under a killed `git status`)
// therefore kept the promise pending for as long as it lived. These start that shape for real.
import { describe, it, expect, afterEach } from "vitest";
import { runTool } from "../../../server/git/run-tool.js";

const node = process.execPath;
const GRANDCHILD_LIFETIME_MS = 30_000;
// Long enough for the child to start node and print the grandchild's pid on a loaded runner; the
// tests that read the pid have nothing to check if the deadline lands first.
const DEADLINE_MS = 3_000;
// Generous: the assertion is "settled near the deadline", not "settled in N ms" — a loaded runner
// is slow, but nowhere near the grandchild's lifetime.
const SETTLE_BOUND_MS = 15_000;
const REAP_WAIT_MS = 5_000;

// The child prints its grandchild's pid, so a test can check whether the grandchild survived.
const grandchildScript = `require("node:child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, ${GRANDCHILD_LIFETIME_MS})"], { stdio: "inherit" })`;
const childThatHangs = `const g = ${grandchildScript}; process.stdout.write(g.pid + "\\n"); setTimeout(() => {}, ${GRANDCHILD_LIFETIME_MS});`;
const childThatExits = `const g = ${grandchildScript}; process.stdout.write(g.pid + "\\n"); process.exit(0);`;

const leftovers: number[] = [];
const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const waitUntilGone = async (pid: number): Promise<boolean> => {
  const until = Date.now() + REAP_WAIT_MS;
  while (Date.now() < until) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isAlive(pid);
};
const grandchildPid = (stdout: string): number => {
  const pid = Number(stdout.trim().split("\n")[0]);
  // 0 would be OUR process group to `process.kill`, so a missing pid must fail here, not reach afterEach.
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`child did not report a grandchild pid: ${JSON.stringify(stdout)}`);
  leftovers.push(pid);
  return pid;
};

afterEach(() => {
  leftovers.splice(0).forEach((pid) => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  });
});

describe("runTool and a grandchild that holds the pipes", () => {
  it("settles at the deadline instead of when the grandchild exits", async () => {
    const started = Date.now();
    const run = await runTool(node, ["-e", childThatHangs], { timeoutMs: DEADLINE_MS });
    expect(Date.now() - started).toBeLessThan(SETTLE_BOUND_MS);
    expect(run.end).toBe("timeout");
    expect(run.code).toBeNull();
  });

  it("kills the grandchild along with the child", async () => {
    const run = await runTool(node, ["-e", childThatHangs], { timeoutMs: DEADLINE_MS });
    expect(await waitUntilGone(grandchildPid(run.stdout))).toBe(true);
  });

  it("returns the child's own answer when it exits in time but the grandchild lingers", async () => {
    const started = Date.now();
    const run = await runTool(node, ["-e", childThatExits], { timeoutMs: GRANDCHILD_LIFETIME_MS });
    grandchildPid(run.stdout);
    expect(Date.now() - started).toBeLessThan(SETTLE_BOUND_MS);
    expect(run).toMatchObject({ end: "exit", code: 0 });
  });

  it("kills the tree when the caller aborts", async () => {
    const stop = new AbortController();
    const pending = runTool(node, ["-e", childThatHangs], { timeoutMs: GRANDCHILD_LIFETIME_MS, signal: stop.signal });
    setTimeout(() => stop.abort(), DEADLINE_MS);
    const run = await pending;
    expect(run.end).toBe("abort");
    expect(await waitUntilGone(grandchildPid(run.stdout))).toBe(true);
  });
});

describe("runTool and an ordinary child", () => {
  it("reports exit status, stdout and stderr", async () => {
    const run = await runTool(node, ["-e", "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"], { timeoutMs: SETTLE_BOUND_MS });
    expect(run).toEqual({ end: "exit", code: 3, stdout: "out", stderr: "err" });
  });

  it("stops at the stdout cap", async () => {
    const run = await runTool(node, ["-e", "process.stdout.write('x'.repeat(100000)); setTimeout(() => {}, 30000)"], {
      timeoutMs: SETTLE_BOUND_MS,
      maxStdoutBytes: 10,
    });
    expect(run.end).toBe("overflow");
  });

  it("reports a binary that cannot be started", async () => {
    const run = await runTool("definitely-not-a-real-binary-xyz", [], { timeoutMs: SETTLE_BOUND_MS });
    expect(run).toEqual({ end: "spawn-error", code: null, stdout: "", stderr: "" });
  });

  it("does not start at all for a signal that has already fired", async () => {
    const already = new AbortController();
    already.abort();
    const run = await runTool(node, ["-e", "process.stdout.write('ran')"], { timeoutMs: SETTLE_BOUND_MS, signal: already.signal });
    expect(run).toEqual({ end: "abort", code: null, stdout: "", stderr: "" });
  });
});
