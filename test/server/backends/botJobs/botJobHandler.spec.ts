// @vitest-environment node
//
// The `botJob` command handler (plans/feat-bot-gpu-jobs.md): it refuses while bot jobs are off,
// writes the job where its cell runs it, and answers with whatever the cell recorded — or fails when
// the cell ended with nothing recorded. The cell is faked: what it leaves on disk is the contract.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBotJobHandler, type BotJobDeps } from "../../../../server/backends/botJobs/botJobHandler.js";
import { DECLINED_FILE, EXIT_CODE_FILE, JOB_FILE, MAX_OUTPUT_BYTES, OUTPUT_FILE, RUN_FILE } from "../../../../server/backends/botJobs/jobScript.js";

const SESSION = "00000000-0000-4000-8000-000000000001";
const PARAMS = { script: "print('hi')", args: ["--n", "3"], from: { tokenId: "t", name: "GrokBot" } };

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "bot-jobs-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

interface Cell {
  /** What the cell leaves in the job directory once the handler has started waiting. */
  leaves?: Record<string, string>;
  /** Whether the pty is still running when asked. */
  alive?: boolean;
}

const setup = (cell: Cell, over: Partial<BotJobDeps> = {}) => {
  const calls = { started: [] as unknown[][], released: [] as string[], notified: [] as string[] };
  let ticks = 0;
  const dir = path.join(root, SESSION);
  const deps: BotJobDeps = {
    config: () => ({ enabled: true, python: "~/venv/bin/python" }),
    platform: "darwin",
    home: "/Users/u",
    jobsRoot: root,
    newId: () => SESSION,
    startCell: (...args) => void calls.started.push(args),
    release: (id) => void calls.released.push(id),
    isAlive: async () => cell.alive ?? true,
    notify: (job, id) => void calls.notified.push(`${job.from}:${id}`),
    pollMs: 0,
    // The cell "acts" after the handler's first look, so the wait is really exercised.
    sleep: async () => {
      ticks += 1;
      if (ticks === 1) for (const [name, text] of Object.entries(cell.leaves ?? {})) writeFileSync(path.join(dir, name), text);
      if (ticks > 50) throw new Error("the handler never stopped waiting");
    },
    ...over,
  };
  return { handler: createBotJobHandler(deps), calls, dir };
};

describe("botJob handler", () => {
  it("refuses while bot jobs are switched off, before writing anything", async () => {
    const { handler, calls } = setup({}, { config: () => ({ enabled: false, python: "python3" }) });
    await expect(handler(PARAMS)).rejects.toThrow(/turned off/);
    expect(calls.started).toEqual([]);
    expect(existsSync(path.join(root, SESSION))).toBe(false);
  });

  it("refuses on Windows, where there is no /bin/sh to run it", async () => {
    const { handler } = setup({}, { platform: "win32" });
    await expect(handler(PARAMS)).rejects.toThrow(/Windows/);
  });

  it("writes the job owner-only and opens its cell on run.sh, with the venv's python", async () => {
    const { handler, calls, dir } = setup({ leaves: { [EXIT_CODE_FILE]: "0\n", [OUTPUT_FILE]: "hi\n" } });
    await handler(PARAMS);
    expect(readFileSync(path.join(dir, JOB_FILE), "utf8")).toBe("print('hi')");
    expect(readFileSync(path.join(dir, RUN_FILE), "utf8")).toContain("'/Users/u/venv/bin/python' 'job.py' '--n' '3'");
    // POSIX modes; Windows has none to check (and bot jobs refuse to run there).
    if (process.platform !== "win32") {
      expect(statSync(dir).mode & 0o777).toBe(0o700);
      expect(statSync(path.join(dir, JOB_FILE)).mode & 0o777).toBe(0o600);
    }
    expect(calls.started).toEqual([[SESSION, "/bin/sh", [path.join(dir, RUN_FILE)], dir]]);
    expect(calls.notified).toEqual([`GrokBot:${SESSION}`]);
  });

  it("answers with the exit code and output once the job has run, and releases the cell", async () => {
    const { handler, calls } = setup({ leaves: { [EXIT_CODE_FILE]: "2\n", [OUTPUT_FILE]: "traceback\n" } });
    expect(await handler(PARAMS)).toEqual({ approved: true, exitCode: 2, output: "traceback\n", truncated: false });
    expect(calls.released).toEqual([SESSION]);
  });

  it("sends back only the tail of a long output", async () => {
    const log = "x".repeat(100) + "y".repeat(MAX_OUTPUT_BYTES);
    const { handler } = setup({ leaves: { [EXIT_CODE_FILE]: "0\n", [OUTPUT_FILE]: log } });
    const result = (await handler(PARAMS)) as { output: string; truncated: boolean };
    expect(result.truncated).toBe(true);
    expect(result.output).toBe("y".repeat(MAX_OUTPUT_BYTES));
  });

  it("answers an empty output when the job wrote no log", async () => {
    const { handler } = setup({ leaves: { [EXIT_CODE_FILE]: "0\n" } });
    expect(await handler(PARAMS)).toEqual({ approved: true, exitCode: 0, output: "", truncated: false });
  });

  it("answers declined when the user said no", async () => {
    const { handler } = setup({ leaves: { [DECLINED_FILE]: "" } });
    expect(await handler(PARAMS)).toEqual({ approved: false, exitCode: null, output: "", truncated: false });
  });

  it("fails when the cell ended with no outcome, and still releases it", async () => {
    const { handler, calls } = setup({ alive: false });
    await expect(handler(PARAMS)).rejects.toThrow(/ended before the job finished/);
    expect(calls.released).toEqual([SESSION]);
  });

  it("takes an outcome that landed just as the cell ended", async () => {
    const dir = path.join(root, SESSION);
    let looks = 0;
    const { handler } = setup(
      {},
      {
        // Dead on the first ask; the exit code is written between that ask and the second look.
        isAlive: async () => {
          looks += 1;
          writeFileSync(path.join(dir, EXIT_CODE_FILE), "0\n");
          return false;
        },
      },
    );
    expect(await handler(PARAMS)).toMatchObject({ approved: true, exitCode: 0 });
    expect(looks).toBe(1);
  });
});
