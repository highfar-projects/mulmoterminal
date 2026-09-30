// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { makeTempDir } from "../support/tempDir.js";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The supervisor's whole reason to exist: unlike `node --watch`, it must RESTART the backend
// after a crash instead of leaving it dead (which is what disconnected every terminal for
// good). Drive it with a stub entry that crashes on boot and assert it comes back.
const SUPERVISOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "dev-server.mjs");

let child: ChildProcess | null = null;
let dir: string | null = null;
// Set when a test itself had to SIGKILL the supervisor, so the cleanup still stops what it left.
let escalated = false;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SUPERVISOR_EXIT_MS = 5000;
const POLL_MS = 100;
// Generous: a loaded machine can take seconds to start two node processes.
const BOOT_WAIT_MS = 15000;

async function waitFor(done: () => boolean, limitMs: number): Promise<void> {
  for (let waited = 0; waited < limitMs && !done(); waited += POLL_MS) await wait(POLL_MS);
}

// SIGTERM, not SIGKILL: the supervisor stops its backend only from its signal handler, and a
// SIGKILL skips it — which left one live stub per run behind, parented to init (#2609).
/** Whether it had to be SIGKILLed — the one case where its backend may be left running. */
async function stopSupervisor(supervisor: ChildProcess): Promise<boolean> {
  if (supervisor.exitCode !== null || supervisor.signalCode !== null) return false;
  const exited = new Promise((resolve) => supervisor.once("exit", resolve));
  supervisor.kill("SIGTERM");
  await Promise.race([exited, wait(SUPERVISOR_EXIT_MS)]);
  const stuck = supervisor.exitCode === null && supervisor.signalCode === null;
  if (stuck) supervisor.kill("SIGKILL");
  return stuck;
}

const bootedPids = (boots: string): number[] => (existsSync(boots) ? readFileSync(boots, "utf8").trim().split("\n").filter(Boolean).map(Number) : []);

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// A supervisor that had to be SIGKILLed passed nothing on, so the backend it started last is stopped
// here. Only then, and only the last: an earlier pid is dead by design — alive again, it is a reused pid
// belonging to someone else. Not on Windows, which reuses pids fast and runs no long-lived stub.
const stopBackends = (boots: string): void => {
  const last = bootedPids(boots).at(-1);
  if (process.platform !== "win32" && last !== undefined && isAlive(last)) process.kill(last, "SIGKILL");
};

afterEach(async () => {
  if (child && (await stopSupervisor(child))) escalated = true;
  child = null;
  if (dir && escalated) stopBackends(path.join(dir, "boots.log"));
  escalated = false;
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("dev-server supervisor", () => {
  it("restarts the backend after it crashes on boot", async () => {
    dir = makeTempDir("dev-server-test-");
    const boots = path.join(dir, "boots.log");
    const stub = path.join(dir, "stub.mjs");
    // Each boot appends its pid, then crashes immediately — so a second line proves a restart.
    writeFileSync(stub, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(boots)}, process.pid + "\\n");\nprocess.exit(1);\n`);
    const watchDir = makeTempDir("dev-server-watch-"); // empty — isolates crash-restart from reload

    child = spawn(process.execPath, [SUPERVISOR], {
      env: { ...process.env, DEV_SERVER_ENTRY: stub, DEV_SERVER_WATCH: watchDir },
      stdio: "ignore",
    });

    // Poll for a second distinct boot (proof it restarted), rather than a fixed sleep.
    let bootCount = 0;
    for (let i = 0; i < 40; i++) {
      if (existsSync(boots)) {
        bootCount = readFileSync(boots, "utf8").trim().split("\n").filter(Boolean).length;
        if (bootCount >= 2) break;
      }
      await wait(200);
    }
    rmSync(watchDir, { recursive: true, force: true });

    // At least two boots means the supervisor brought the backend back after the first crash.
    expect(bootCount).toBeGreaterThanOrEqual(2);
  }, 15000);

  // What `yarn dev`'s Ctrl-C relies on. Not on Windows: a SIGTERM there terminates without running
  // the handler that passes it on.
  it.skipIf(process.platform === "win32")(
    "stops the backend it started when it is stopped",
    async () => {
      dir = makeTempDir("dev-server-test-");
      const boots = path.join(dir, "boots.log");
      const stub = path.join(dir, "stub.mjs");
      writeFileSync(
        stub,
        `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(boots)}, process.pid + "\\n");\nsetInterval(() => {}, 1000);\n`,
      );
      const watchDir = makeTempDir("dev-server-watch-");
      child = spawn(process.execPath, [SUPERVISOR], { env: { ...process.env, DEV_SERVER_ENTRY: stub, DEV_SERVER_WATCH: watchDir }, stdio: "ignore" });
      await waitFor(() => bootedPids(boots).length > 0, BOOT_WAIT_MS);
      const [backend] = bootedPids(boots);
      expect(backend, "the backend never booted").toBeDefined();
      expect(isAlive(backend)).toBe(true);

      escalated = await stopSupervisor(child);
      await waitFor(() => !isAlive(backend), SUPERVISOR_EXIT_MS);
      rmSync(watchDir, { recursive: true, force: true });
      expect(isAlive(backend)).toBe(false);
    },
    30000,
  );

  // Skipped on Windows, where it is flaky rather than failing: `fs.watch` gives no delivery
  // guarantee there, and the same commit passes on one Node version and not the other (#802).
  // The 8.3-short-path workaround and the 50-round re-touch loop below already push it as far
  // as it goes; what is left is the platform's, and a CI job that is red half the time hides
  // the regressions it exists to catch. The crash-restart case above still covers Windows.
  it.skipIf(process.platform === "win32")(
    "restarts the backend when a watched source file changes",
    async () => {
      dir = makeTempDir("dev-server-test-");
      const boots = path.join(dir, "boots.log");
      const stub = path.join(dir, "stub.mjs");
      // A backend that boots (records its pid) and STAYS ALIVE — so a second boot can only come
      // from the supervisor killing it on a file change and starting a fresh one.
      writeFileSync(
        stub,
        `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(boots)}, process.pid + "\\n");\nsetInterval(() => {}, 1000);\n`,
      );
      // realpathSync expands a Windows 8.3 short path (os.tmpdir() → C:\Users\RUNNER~1\…), which
      // fs.watch is unreliable on (see docs/windows-gotchas.md).
      const watchDir = makeTempDir("dev-server-watch-");

      child = spawn(process.execPath, [SUPERVISOR], {
        env: { ...process.env, DEV_SERVER_ENTRY: stub, DEV_SERVER_WATCH: watchDir },
        stdio: "ignore",
      });

      // Wait for the first (persistent) boot before touching the watched dir.
      for (let i = 0; i < 40 && !existsSync(boots); i++) await wait(100);

      // Poll for the second boot, RE-TOUCHING the source each round. fs.watch gives no delivery
      // guarantee and on Windows can arm late or drop the first event, so a single write is flaky;
      // re-touching until the restart lands makes it deterministic. Extra restarts only push the
      // count past the >=2 we assert.
      const touched = path.join(watchDir, "touched.ts");
      let bootCount = 0;
      for (let i = 0; i < 50; i++) {
        writeFileSync(touched, `export const x = ${i};\n`);
        await wait(200); // > the supervisor's 120ms change debounce, so each write can trigger
        bootCount = existsSync(boots) ? readFileSync(boots, "utf8").trim().split("\n").filter(Boolean).length : 0;
        if (bootCount >= 2) break;
      }
      rmSync(watchDir, { recursive: true, force: true });

      expect(bootCount).toBeGreaterThanOrEqual(2);
    },
    20000,
  );
});
