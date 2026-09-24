// Every process on the machine with its parent and cumulative CPU time, in one `ps` call. `-A -o`
// is the spelling both macOS and Linux (procps) accept; the parsing is pure and pinned to what
// each prints.
import { spawnCaptureAsync } from "./spawnCapture.js";

export interface ProcessRow {
  pid: number;
  ppid: number;
  cpuSeconds: number;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 86_400;

const WHOLE_NUMBER = /^\d+$/;
const DECIMAL_NUMBER = /^\d+\.\d+$/;
const isSecondsField = (field: string): boolean => WHOLE_NUMBER.test(field) || DECIMAL_NUMBER.test(field);

/** `ps -o time`: macOS prints `M:SS.cc` (minutes unbounded), Linux `[D-]HH:MM:SS`. */
export function parseCpuTime(text: string): number | null {
  const trimmed = text.trim();
  const dash = trimmed.indexOf("-");
  const days = dash === -1 ? "0" : trimmed.slice(0, dash);
  const fields = (dash === -1 ? trimmed : trimmed.slice(dash + 1)).split(":");
  const seconds = fields[fields.length - 1];
  const wholeFields = fields.slice(0, -1);
  if (!WHOLE_NUMBER.test(days) || wholeFields.length === 0 || seconds === undefined) return null;
  if (!isSecondsField(seconds) || !wholeFields.every((field) => WHOLE_NUMBER.test(field))) return null;
  const clock = fields.map(Number).reduce((total, field) => total * SECONDS_PER_MINUTE + field, 0);
  return Number(days) * SECONDS_PER_DAY + clock;
}

export function parseProcessRows(stdout: string): ProcessRow[] {
  return stdout.split("\n").flatMap((line) => {
    const [pidText, ppidText, timeText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const ppid = Number(ppidText);
    const cpuSeconds = timeText === undefined ? null : parseCpuTime(timeText);
    return Number.isInteger(pid) && Number.isInteger(ppid) && cpuSeconds !== null ? [{ pid, ppid, cpuSeconds }] : [];
  });
}

/** One listing, or null when `ps` cannot answer (Windows has none). */
export async function listProcessRows(): Promise<ProcessRow[] | null> {
  const r = await spawnCaptureAsync("ps", ["-Ao", "pid=,ppid=,time="]);
  return r.status === 0 ? parseProcessRows(r.stdout) : null;
}
