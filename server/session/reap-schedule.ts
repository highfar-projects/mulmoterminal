// WHEN the idle sweep runs: once at boot, and — when asked for — again on a timer (#2165).
//
// The boot sweep is the strong one. At startup none of OUR ptys hold anything, so nothing is held
// back by `liveHere` and the pile is at its largest. The timer is necessarily WEAKER — a session
// this server holds a pty for is skipped whatever its age — and does not replace it. What it
// reaches is the class that accumulates during a long run: the pty let go, no terminal attached,
// nothing written for `idleDays` days. A server left up for weeks otherwise never looks again.
import { REAP_INTERVAL_HOURS_OFF, reapIntervalMs, reapTimerEnabled } from "../../common/sessionReap.js";
import { reapSweepLines, sweepIdleSessions } from "./reap-idle-sessions.js";
import { cleanupSessionSettings } from "./session-settings.js";
import { cleanupSessionDrops } from "./session-drops.js";
import { SESSION_ID_RE } from "../config/env.js";

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

/**
 * Drop what a session the TIMER ended left on disk.
 *
 * The boot sweep does not need this — infra/on-listening.ts prunes orphans straight after it, against
 * the live-peer cutoff that only a boot can work out (#1061). A tick has no such follower, so
 * without this the files outlive the session until the next restart, and the whole reason to
 * enable a timer is that the next restart is far away.
 *
 * What is being left behind is not inert: session-settings.ts keeps a provider session's API
 * token in its file, which is why #1467 removes these at all.
 *
 * The id is checked before it becomes a path. The sweep ends ids that are NOT session ids on
 * purpose — an unparseable one is unreachable by every route and can only leak (#1533) — and
 * `settingsFile()` joins the id straight onto the settings directory. The boot prunes already
 * make this check; a second route to the same files needs it too.
 */
const dropEndedSessionFiles = (reaped: readonly string[]): void => {
  reaped
    .filter((id) => SESSION_ID_RE.test(id))
    .forEach((id) => {
      cleanupSessionSettings(id);
      cleanupSessionDrops(id);
    });
};

/**
 * What a previous schedule started: the interval so a new one can stop it, and the cadence it was
 * started WITH so the running server can be asked about itself (#2184).
 *
 * One value rather than two, because the whole difficulty in this area is a pair that drifts. The
 * timer and the number describing it are set and cleared in the same assignment, so there is no
 * state in which a cadence is reported and nothing is ticking, or the reverse.
 */
let armed: { timer: ReturnType<typeof setInterval>; intervalHours: number } | null = null;

/**
 * The cadence THIS process is running, which is not the cadence in the config.
 *
 * The timer is armed once, at boot, and deliberately not re-armed when the config is POSTed — a
 * stream of edits would reset the countdown forever (#2167). So from the moment someone saves a
 * new interval until the next restart, the saved number describes a future server and this one
 * describes the running one. A screen that wants to say what WILL happen needs this one.
 */
export const armedReapIntervalHours = (): number => armed?.intervalHours ?? REAP_INTERVAL_HOURS_OFF;

/**
 * Stop whatever a previous schedule armed.
 *
 * This runs before ANYTHING that can decline to reach it, and there are two such things — which is
 * why it is a step of its own rather than a line inside the arming. A cadence of nought returns
 * early from `armTimer`, and the immediate sweep can throw (tmux gone, the threshold unreadable).
 * Either one would leave the previous interval ending sessions on a cadence the caller has just
 * replaced, which is the defect itself rather than a variant of it (#2193).
 *
 * Production calls this once, at boot, so it is idempotence rather than a live bug — but the entry
 * point is exported, nothing forbids a second call, and a duplicated sweep is the quiet kind of
 * wrong. It is NOT the live re-arming #2167 declined: that was re-arming on every config POST,
 * which lets a stream of edits reset the countdown forever. Only an explicit new schedule gets here.
 */
const stopArmedTimer = (): void => {
  if (armed === null) return;
  clearInterval(armed.timer);
  armed = null;
};

// Off unless asked for: a running server that starts ending sessions because someone upgraded is
// the surprise worth avoiding.
function armTimer({ intervalHours, idleDays, log }: ReapSchedule): void {
  if (!reapTimerEnabled(intervalHours)) return;
  log(`[tmux] idle-session sweep repeats every ${intervalHours}h`);
  const timer = setInterval(() => {
    dropEndedSessionFiles(sweepNow(idleDays, log).reaped);
  }, reapIntervalMs(intervalHours));
  timer.unref(); // a sweep waiting to run is never a reason to keep the process alive
  armed = { timer, intervalHours };
}

/** Sweeps once, arms the repeat, and answers with what the boot sweep ended. */
export function startReapSchedule(schedule: ReapSchedule): string[] {
  stopArmedTimer();
  const sweep = sweepNow(schedule.idleDays, schedule.log);
  armTimer(schedule);
  return sweep.reaped;
}
