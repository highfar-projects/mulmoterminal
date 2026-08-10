// A spawned pty must give back every fd it took. node-pty 1.1.0 kept two per spawn on macOS — an
// unused `/dev/ptmx` its own cleanup loop skipped, and the slave the parent never closed — so a
// server that had started a few hundred sessions could no longer open a pty at all, and the only
// cure was restarting it (#1595).
//
// This counts real fds rather than asserting a version, because the question is whether the
// CURRENT node-pty still leaks, and that has to keep being true across the next upgrade. macOS
// only: the bug lives in that platform's `pty_posix_spawn`, and `lsof` is how the count is taken.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import type { IPty } from "node-pty";
import { spawnPty } from "../../../server/session/pty-spawn.js";

// Named absolutely: this is macOS's own lsof, and a PATH lookup would let anything earlier on
// PATH answer the question instead.
const LSOF = "/usr/sbin/lsof";
const SPAWNS = 8;
// node-pty closes the master 200ms after exit, so the count is not final the moment onExit fires.
const SETTLE_DEADLINE_MS = 5_000;
const SETTLE_POLL_MS = 100;

/** How many `/dev/ptmx` fds this process holds, or null where lsof cannot answer. */
const ptmxFds = (): number | null => {
  const parse = (out: string): number => out.split("\n").filter((line) => line.includes("/dev/ptmx")).length;
  try {
    return parse(execFileSync(LSOF, ["-p", String(process.pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch (err) {
    // lsof exits non-zero when any one fd is unreadable, having already printed the rest.
    const partial = err instanceof Error && "stdout" in err ? err.stdout : null;
    return typeof partial === "string" && partial.length > 0 ? parse(partial) : null;
  }
};

const exitOf = (pty: IPty): Promise<void> => new Promise((resolve) => pty.onExit(() => resolve()));

const settleTo = async (target: number): Promise<number> => {
  const deadline = Date.now() + SETTLE_DEADLINE_MS;
  for (;;) {
    const count = ptmxFds() ?? target;
    if (count <= target || Date.now() > deadline) return count;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
  }
};

describe.skipIf(process.platform !== "darwin")("spawnPty fd accounting", () => {
  it("holds no /dev/ptmx fd once the pty has been killed", async (ctx) => {
    const before = ptmxFds();
    if (before === null) return ctx.skip();

    for (let i = 0; i < SPAWNS; i++) {
      const pty = spawnPty("/bin/cat", [], "/tmp");
      pty.onData(() => {});
      const exited = exitOf(pty);
      pty.kill();
      await exited;
    }

    expect(await settleTo(before)).toBe(before);
  });
});
