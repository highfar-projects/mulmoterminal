// The `botJobs` setting: whether this host runs Python a remote bot submits through mulmoserver's
// submitBotJob, and with which interpreter (plans/feat-bot-gpu-jobs.md). Both sides read it — the
// server sanitizes the file, the Settings section edits the same shape.
import { isRecord } from "./isRecord.js";

export interface BotJobs {
  /** Off by default: a job is code from another machine, so nothing runs until the user says so. */
  enabled: boolean;
  /** The interpreter a job runs with. Usually a venv's python, since that is where the GPU packages
   *  (torch with MPS, …) live and the system python has none of them. A leading `~/` is the home. */
  python: string;
}

export const BOT_JOBS_DEFAULT: BotJobs = { enabled: false, python: "python3" };

const MAX_PYTHON_LENGTH = 1024;
// eslint-disable-next-line no-control-regex -- intentional: a path with a control byte is not a path anyone typed
const CONTROL_BYTES = /[\u0000-\u001F\u007F]/u;

const pythonOf = (value: unknown): string => {
  if (typeof value !== "string") return BOT_JOBS_DEFAULT.python;
  const python = value.trim();
  return python && python.length <= MAX_PYTHON_LENGTH && !CONTROL_BYTES.test(python) ? python : BOT_JOBS_DEFAULT.python;
};

/** Anything unrecognised is "unconfigured", and `enabled` is on only for a literal `true`: a typo
 *  must never be what lets another machine's code run here. */
export function sanitizeBotJobs(input: unknown): BotJobs {
  if (!isRecord(input)) return BOT_JOBS_DEFAULT;
  return { enabled: input.enabled === true, python: pythonOf(input.python) };
}
