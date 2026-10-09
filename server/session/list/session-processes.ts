// The Processes page's model (#2219): each session's process tree, from one `ps` listing and the
// tmux pane pids. Pure, so the tree walk, the CPU delta and the kill rule are tested without a
// machine running anything in particular.
import type { ProcessDetail } from "../../infra/process/process-list.js";
import { isPaneRoot, type SessionProcess, type SessionProcesses } from "../../../common/sessionProcesses.js";

/** The previous read, which CPU is measured against. Keyed by pid AND start time: a reused pid is
 *  a different process and has no share of the interval. */
export interface CpuBaseline {
  atMs: number;
  cpuSecondsOf: ReadonlyMap<string, number>;
}

const MS_PER_SECOND = 1000;
const PERCENT = 100;

const identity = (row: Pick<ProcessDetail, "pid" | "startedAt">): string => `${row.pid}@${row.startedAt}`;

export const cpuBaselineOf = (rows: readonly ProcessDetail[], atMs: number): CpuBaseline => ({
  atMs,
  cpuSecondsOf: new Map(rows.map((row) => [identity(row), row.cpuSeconds])),
});

function cpuPercentOf(row: ProcessDetail, baseline: CpuBaseline | null, atMs: number): number | null {
  const intervalSeconds = baseline === null ? 0 : (atMs - baseline.atMs) / MS_PER_SECOND;
  if (baseline === null || intervalSeconds <= 0) return null;
  const before = baseline.cpuSecondsOf.get(identity(row));
  // Started since the last read: whatever it has used, it used inside this interval.
  const spent = before === undefined ? row.cpuSeconds : Math.max(0, row.cpuSeconds - before);
  return (spent / intervalSeconds) * PERCENT;
}

function childrenByParent(rows: readonly ProcessDetail[]): Map<number, ProcessDetail[]> {
  const children = new Map<number, ProcessDetail[]>();
  [...rows].sort((a, b) => a.pid - b.pid).forEach((row) => children.set(row.ppid, [...(children.get(row.ppid) ?? []), row]));
  return children;
}

/** The root and everything below it, parents before children. A pid met twice is not walked twice. */
function preorder(root: ProcessDetail, children: ReadonlyMap<number, readonly ProcessDetail[]>, seen: Set<number>): { row: ProcessDetail; depth: number }[] {
  const out: { row: ProcessDetail; depth: number }[] = [];
  const pending: { row: ProcessDetail; depth: number }[] = [{ row: root, depth: 0 }];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined || seen.has(next.row.pid)) continue;
    seen.add(next.row.pid);
    out.push(next);
    const below = children.get(next.row.pid) ?? [];
    pending.push(...[...below].reverse().map((row) => ({ row, depth: next.depth + 1 })));
  }
  return out;
}

export interface SessionProcessInputs {
  rows: readonly ProcessDetail[];
  /** Each session's pane root pids. */
  panePids: ReadonlyMap<string, readonly number[]>;
  cwdOf: (sessionId: string) => string | null;
  baseline: CpuBaseline | null;
  atMs: number;
}

/** Every session with its processes, sessions in id order. A pane whose root is already gone has
 *  nothing to show and is left out. */
export function buildSessionProcesses({ rows, panePids, cwdOf, baseline, atMs }: SessionProcessInputs): SessionProcesses[] {
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const children = childrenByParent(rows);
  return [...panePids.keys()]
    .sort((a, b) => a.localeCompare(b))
    .flatMap((sessionId) => {
      const seen = new Set<number>();
      const roots = (panePids.get(sessionId) ?? []).flatMap((pid) => byPid.get(pid) ?? []);
      const walked = roots.flatMap((root) => preorder(root, children, seen));
      if (walked.length === 0) return [];
      const processes: SessionProcess[] = walked.map(({ row, depth }) => ({
        pid: row.pid,
        ppid: row.ppid,
        depth,
        command: row.command,
        rssKb: row.rssKb,
        elapsedSeconds: row.elapsedSeconds,
        startedAt: row.startedAt,
        cpuPercent: cpuPercentOf(row, baseline, atMs),
      }));
      return [{ sessionId, cwd: cwdOf(sessionId), processes }];
    });
}

export type KillVerdict = "kill" | "gone" | "pane-root";

/** Whether a kill request names a process this page may end. Only one under a session's pane,
 *  so the route cannot be aimed at an arbitrary process on the machine; never the pane's root,
 *  because ending that is ending the session, which has its own route that also cleans up. */
export function killVerdict(sessions: readonly SessionProcesses[], pid: number, startedAt: string): KillVerdict {
  const found = sessions.flatMap((session) => session.processes).find((process) => process.pid === pid && process.startedAt === startedAt);
  if (found === undefined) return "gone";
  return isPaneRoot(found) ? "pane-root" : "kill";
}
