// Ending the sessions nothing is using, once per server start (#1467).
//
// The report was "cleanup-orphans is never called". Calling it was not enough: it consulted
// `isResumableTmuxSession`, which is made of permanent records — a transcript that is never
// deleted, an append-only grid log — so on the machine this was measured on it would have ended
// 2 of 22 sessions while 15 sat idle for hours with nobody attached.
//
// So the rule is `reapableTmuxSession`: nothing about the past, only whether anything is USING it
// now (infra/tmux.ts). What is lost when one is ended is the work in flight and the scrollback; the
// conversation is on disk and resumes without the tmux session, which is what made "it has a
// transcript" the wrong reason to keep it alive.
import { reapableTmuxSession, tmuxAttachedCounts, tmuxKillSession, tmuxListSessionIds, tmuxSessionActivity } from "../infra/tmux.js";
import { reapIdleSeconds, reapSweepEnabled } from "../../common/sessionReap.js";
import { ptys } from "./registry.js";

export interface ReapSweepResult {
  reaped: string[];
  /** Kept because a terminal is holding it, or tmux would not say who. */
  heldBack: number;
  /** Kept because it has been active within the threshold, or its age is unknown. */
  recent: number;
}

export interface ReapSweepInput {
  ids: readonly string[];
  activity: Map<string, number> | null;
  attached: Map<string, number> | null;
  nowSeconds: number;
  idleDays: number;
  liveHere: (id: string) => boolean;
  kill: (id: string) => void;
}

/** Pure but for `kill`, so what the sweep decides can be pinned without tmux — and so the counts it
 *  reports are the counts it acted on, rather than a second tally that can drift from them. */
export function reapIdleSessions(input: ReapSweepInput): ReapSweepResult {
  const result: ReapSweepResult = { reaped: [], heldBack: 0, recent: 0 };
  if (!reapSweepEnabled(input.idleDays)) return result;
  const idleThresholdSeconds = reapIdleSeconds(input.idleDays);
  for (const id of input.ids) {
    const seen = input.activity?.get(id);
    const facts = {
      // Absent from `list-clients` means zero clients — that call only reports sessions that HAVE
      // one. Null (tmux itself could not answer) is a different thing and must not read as zero.
      attachedCount: input.attached === null ? null : (input.attached.get(id) ?? 0),
      liveHere: input.liveHere(id),
      idleSeconds: seen === undefined ? null : input.nowSeconds - seen,
      idleThresholdSeconds,
    };
    if (reapableTmuxSession(facts)) {
      input.kill(id);
      result.reaped.push(id);
    } else if (facts.liveHere || facts.attachedCount !== 0) {
      result.heldBack += 1;
    } else {
      result.recent += 1;
    }
  }
  return result;
}

/**
 * The sessions still standing after a sweep.
 *
 * Its own function because boot reads the tmux list BEFORE sweeping and then decides from it which
 * settings and drop files are orphaned. A file kept because its session was in that list outlives
 * the session by a whole boot — and a session settings file can hold a provider's API token, which
 * is the reason that prune exists at all.
 */
export const survivingAfterSweep = (surviving: readonly string[], reaped: readonly string[]): Set<string> => {
  const ended = new Set(reaped);
  return new Set(surviving.filter((id) => !ended.has(id)));
};

const SECONDS_PER_MS = 1000;

/** The lines the sweep prints. Both of them: a sweep that says only what it killed leaves the
 *  reader unable to tell "nothing was old enough" from "it did not run" — which is the state
 *  #1467 was filed about. */
export function reapSweepLines(result: ReapSweepResult, idleDays: number): string[] {
  if (!reapSweepEnabled(idleDays)) return ["[tmux] idle-session sweep off (sessionIdleReapDays: 0)"];
  const kept = result.heldBack + result.recent;
  const lines: string[] = [];
  if (result.reaped.length) lines.push(`[tmux] ended ${result.reaped.length} idle session(s) — nobody attached, no output for ${idleDays} day(s)`);
  if (kept) lines.push(`[tmux] kept ${kept}: ${result.heldBack} in use, ${result.recent} active within ${idleDays} day(s)`);
  return lines;
}

/** The live sweep, for boot. Takes the clock so the decision stays testable. */
export function sweepIdleSessions(nowMs: number, idleDays: number): ReapSweepResult {
  return reapIdleSessions({
    ids: tmuxListSessionIds(),
    activity: tmuxSessionActivity(),
    attached: tmuxAttachedCounts(),
    nowSeconds: Math.floor(nowMs / SECONDS_PER_MS),
    idleDays,
    // At boot this is empty, and that is not something to rely on: the sweep is written to be safe
    // whenever it runs, so a later caller (a timer, a button) cannot turn it into a session killer.
    liveHere: (id) => ptys.has(id),
    kill: tmuxKillSession,
  });
}
