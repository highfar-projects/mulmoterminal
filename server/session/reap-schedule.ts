// WHEN the idle sweep runs: once at boot, and — when asked for — again on a timer (#2165).
//
// The boot sweep is the strong one. At startup none of OUR ptys hold anything, so nothing is held
// back by `liveHere` and the pile is at its largest. The timer is necessarily WEAKER — a session
// this server holds a pty for is skipped whatever its age — and does not replace it. What it
// reaches is the class that accumulates during a long run: the pty let go, no terminal attached,
// nothing written for `idleDays` days. A server left up for weeks otherwise never looks again.
import { reapIntervalMs, reapTimerEnabled } from "../../common/sessionReap.js";
import { reapSweepLines, sweepIdleSessions } from "./reap-idle-sessions.js";

export interface ReapSchedule {
  intervalHours: number;
  /** Read at each sweep rather than captured: the threshold is live config and may have changed. */
  idleDays: () => number;
  log: (line: string) => void;
}

const sweepNow = (idleDays: () => number, log: (line: string) => void) => {
  const days = idleDays();
  const sweep = sweepIdleSessions(Date.now(), days);
  reapSweepLines(sweep, days).forEach(log);
  return sweep;
};

// Off unless asked for: a running server that starts ending sessions because someone upgraded is
// the surprise worth avoiding.
function armTimer({ intervalHours, idleDays, log }: ReapSchedule): void {
  if (!reapTimerEnabled(intervalHours)) return;
  log(`[tmux] idle-session sweep repeats every ${intervalHours}h`);
  const timer = setInterval(() => {
    sweepNow(idleDays, log);
  }, reapIntervalMs(intervalHours));
  timer.unref(); // a sweep waiting to run is never a reason to keep the process alive
}

/** Sweeps once, arms the repeat, and answers with what the boot sweep ended. */
export function startReapSchedule(schedule: ReapSchedule): string[] {
  const sweep = sweepNow(schedule.idleDays, schedule.log);
  armTimer(schedule);
  return sweep.reaped;
}
