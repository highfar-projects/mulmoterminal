// What the Processes page shows: each tmux session and the process tree under its panes (#2219).
//
// In `common/` because both sides decide from it: the server builds it from `ps` and tmux
// (server/session/list/session-processes.ts), and the page reads it back and highlights from it.
import { isRecord } from "./isRecord.js";
import { isUnknownArray } from "./isUnknownArray.js";

export interface SessionProcess {
  pid: number;
  ppid: number;
  /** How far below the pane's root process, for indenting. The root is 0. */
  depth: number;
  command: string;
  rssKb: number;
  elapsedSeconds: number;
  /** With `pid`, what a kill request names, so a reused pid is never the one killed. */
  startedAt: string;
  /** Percent of one core since the previous read; null on the first read, which has no baseline. */
  cpuPercent: number | null;
}

export interface SessionProcesses {
  sessionId: string;
  /** Where the session runs, when this server remembers it. */
  cwd: string | null;
  /** Preorder, so each process sits under its parent. */
  processes: SessionProcess[];
}

// A process this busy is the one a person opened the page to find.
export const HOT_CPU_PERCENT = 50;
// A day: a `yarn dev` left running since yesterday is worth a second look, not a kill.
export const LONG_RUNNING_SECONDS = 86_400;

export const isHot = (process: SessionProcess): boolean => process.cpuPercent !== null && process.cpuPercent >= HOT_CPU_PERCENT;
export const isLongRunning = (process: SessionProcess): boolean => process.elapsedSeconds >= LONG_RUNNING_SECONDS;

/** The pane's own root process. Ending it is ending the session, which has its own route. */
export const isPaneRoot = (process: SessionProcess): boolean => process.depth === 0;

const isSessionProcess = (value: unknown): value is SessionProcess =>
  isRecord(value) &&
  typeof value.pid === "number" &&
  typeof value.ppid === "number" &&
  typeof value.depth === "number" &&
  typeof value.command === "string" &&
  typeof value.rssKb === "number" &&
  typeof value.elapsedSeconds === "number" &&
  typeof value.startedAt === "string" &&
  (value.cpuPercent === null || typeof value.cpuPercent === "number");

const isSessionProcesses = (value: unknown): value is SessionProcesses =>
  isRecord(value) &&
  typeof value.sessionId === "string" &&
  (value.cwd === null || typeof value.cwd === "string") &&
  isUnknownArray(value.processes) &&
  value.processes.every(isSessionProcess);

/** A `GET /api/processes` body, or null when it is not one. A session that does not parse is
 *  dropped rather than the whole list: one odd row should not blank the page. */
export function readProcessesBody(body: unknown): SessionProcesses[] | null {
  if (!isRecord(body) || !isUnknownArray(body.sessions)) return null;
  return body.sessions.filter(isSessionProcesses);
}
