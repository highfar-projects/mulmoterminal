// The `botJob` command: Python a remote bot submitted through mulmoserver's submitBotJob, run in a
// visible terminal cell after the user approves it there (plans/feat-bot-gpu-jobs.md).
//
// The handler is ALWAYS in the table, so `botJob` is always advertised and mulmoserver's
// capability check means "this MulmoTerminal knows the command". Whether this host runs one is
// `botJobs.enabled`, read per job: switching it off takes effect for the next job, no restart.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { JsonObject, JsonValue } from "@mulmoclaude/core/remote-host";
import type { BotJobs } from "../../../common/botJobs.js";
import {
  DECLINED_FILE,
  EXIT_CODE_FILE,
  JOB_FILE,
  MAX_OUTPUT_BYTES,
  OUTPUT_FILE,
  RUN_FILE,
  buildRunScript,
  expandHome,
  outputTail,
  parseBotJobRequest,
  parseExitCode,
  type BotJobRequest,
} from "./jobScript.js";

export interface BotJobDeps {
  config: () => BotJobs;
  platform: NodeJS.Platform;
  home: string;
  /** Where each job gets its own directory, named by its session id. */
  jobsRoot: string;
  newId: () => string;
  /** Open the job's cell: a persistent shell running `/bin/sh run.sh`, left for the grid to adopt and
   *  kept from the detached-session reaper until `release`. */
  startCell: (sessionId: string, file: string, args: string[], cwd: string) => void;
  release: (sessionId: string) => void;
  /** Whether the cell's program is still running — the pty, or the tmux session it was attached to. */
  isAlive: (sessionId: string) => Promise<boolean>;
  /** Tell the user a job is waiting for them. Must not throw. */
  notify: (job: BotJobRequest, sessionId: string) => void;
  pollMs: number;
  sleep: (ms: number) => Promise<void>;
}

const exists = (file: string): Promise<boolean> =>
  fs.access(file).then(
    () => true,
    () => false,
  );

// The end of the log and nothing more: a verbose job can write gigabytes, and only the tail goes back.
// One byte past the limit is read so outputTail can still tell a cut from an exact fit.
async function readLogTail(file: string): Promise<Buffer> {
  const handle = await fs.open(file, "r").catch(() => null);
  if (!handle) return Buffer.alloc(0);
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, MAX_OUTPUT_BYTES + 1);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const finishedResult = async (dir: string): Promise<JsonValue> => {
  const exitCode = parseExitCode(await fs.readFile(path.join(dir, EXIT_CODE_FILE), "utf8"));
  return { approved: true, exitCode, ...outputTail(await readLogTail(path.join(dir, OUTPUT_FILE))) };
};

// One look at the job directory: the outcome, or null while there is none yet.
const outcomeOf = async (dir: string): Promise<JsonValue | null> => {
  if (await exists(path.join(dir, EXIT_CODE_FILE))) return finishedResult(dir);
  if (await exists(path.join(dir, DECLINED_FILE))) return { approved: false, exitCode: null, output: "", truncated: false };
  return null;
};

// Until the script records an outcome, or its terminal is gone without one — closed by the user, or
// the run interrupted with Ctrl-C, which ends run.sh before it writes the exit code. Looked at once
// more after the pty is gone: the outcome can land between the two checks.
async function waitForOutcome(deps: BotJobDeps, sessionId: string, dir: string): Promise<JsonValue> {
  for (;;) {
    const outcome = await outcomeOf(dir);
    if (outcome) return outcome;
    if (!(await deps.isAlive(sessionId))) {
      const last = await outcomeOf(dir);
      if (last) return last;
      throw new Error("the job's terminal ended before the job finished (closed or interrupted)");
    }
    await deps.sleep(deps.pollMs);
  }
}

export const createBotJobHandler =
  (deps: BotJobDeps) =>
  async (params: JsonObject): Promise<JsonValue> => {
    const config = deps.config();
    if (!config.enabled) throw new Error("bot jobs are turned off on this host (botJobs.enabled)");
    if (deps.platform === "win32") throw new Error("bot jobs need /bin/sh and are not available on Windows");
    const job = parseBotJobRequest(params);
    const sessionId = deps.newId();
    const dir = path.join(deps.jobsRoot, sessionId);
    // Owner-only: the directory holds code from another machine and what it printed.
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(dir, JOB_FILE), job.script, { mode: 0o600 });
    await fs.writeFile(path.join(dir, RUN_FILE), buildRunScript(job, expandHome(config.python, deps.home)), { mode: 0o600 });
    deps.startCell(sessionId, "/bin/sh", [path.join(dir, RUN_FILE)], dir);
    try {
      deps.notify(job, sessionId);
      return await waitForOutcome(deps, sessionId, dir);
    } finally {
      deps.release(sessionId);
    }
  };
