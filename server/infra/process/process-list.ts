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

/** A row with enough to show a person what it is, and to tell it apart from a later process that
 *  reuses its pid. */
export interface ProcessDetail extends ProcessRow {
  rssKb: number;
  elapsedSeconds: number;
  /** `ps -o lstart`, kept as printed: with the pid, it is the process's identity. */
  startedAt: string;
  command: string;
}

// pid, ppid, time, rss, etime, then lstart's five words (`Thu Oct  2 18:00:00 2026` under LC_ALL=C).
const FIELDS_BEFORE_COMMAND = 10;
const LSTART_FROM = 5;

/** Whitespace tokens up to the command, and where the command starts — the command keeps its own
 *  spacing, so it is sliced off the line rather than re-joined. */
function splitBeforeCommand(line: string): { fields: string[]; command: string } | null {
  const tokens = [...line.matchAll(/\S+/g)];
  const commandToken = tokens[FIELDS_BEFORE_COMMAND];
  if (commandToken === undefined) return null;
  return { fields: tokens.slice(0, FIELDS_BEFORE_COMMAND).map((token) => token[0]), command: line.slice(commandToken.index).trimEnd() };
}

function parseDetailLine(line: string): ProcessDetail | null {
  const split = splitBeforeCommand(line);
  if (split === null) return null;
  const [pidText, ppidText, timeText = "", rssText = "", etimeText = ""] = split.fields;
  const [pid, ppid, rssKb] = [Number(pidText), Number(ppidText), Number(rssText)];
  const cpuSeconds = parseCpuTime(timeText);
  const elapsedSeconds = parseCpuTime(etimeText);
  if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !Number.isInteger(rssKb) || cpuSeconds === null || elapsedSeconds === null) return null;
  return { pid, ppid, cpuSeconds, rssKb, elapsedSeconds, startedAt: split.fields.slice(LSTART_FROM).join(" "), command: split.command };
}

export const parseProcessDetails = (stdout: string): ProcessDetail[] => stdout.split("\n").flatMap((line) => parseDetailLine(line) ?? []);

/** The listing the Processes page reads. `etime` is printed in `time`'s shape, so one parser reads
 *  both; LC_ALL=C keeps `lstart` to the five words the parser counts. */
export async function listProcessDetails(): Promise<ProcessDetail[] | null> {
  const r = await spawnCaptureAsync("ps", ["-Ao", "pid=,ppid=,time=,rss=,etime=,lstart=,command="], { env: { ...process.env, LC_ALL: "C" } });
  return r.status === 0 ? parseProcessDetails(r.stdout) : null;
}
