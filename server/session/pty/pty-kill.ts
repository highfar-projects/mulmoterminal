// Ending a pty whose program must not outlive it: SIGHUP, then SIGKILL if the program ignored it.
//
// For a pty that runs the program DIRECTLY. A tmux-backed session's pty is only the tmux client,
// and its program is ended by `tmux kill-session`, not by anything sent to this pid.
import type { IPty } from "node-pty";
import { isRecord } from "../../../common/isRecord.js";
import { killSignalsFor, type PtyKillSignal } from "./pty-kill-plan.js";

// Long enough for a shell to run its exit traps, short enough that an ignored SIGHUP does not
// leave a program holding a closed cell's directory for long.
export const PTY_KILL_GRACE_MS = 5_000;

/** The part of a pty the kill touches — narrow, so a spec (or the rate-limit probe's own type)
 *  can hand it something smaller than a node-pty IPty. */
export type KillablePty = Pick<IPty, "pid" | "kill">;

// Filled from the spawn, not from the kill: a kill can run after the exit (reap is reached from
// onExit), and a listener added then would never fire — so the escalation would signal a pid the
// OS may already have handed to another process.
const exitedPtys = new WeakSet<object>();

export function trackPtyExit(term: Pick<IPty, "onExit">): void {
  term.onExit(() => exitedPtys.add(term));
}

export const ptyHasExited = (term: object): boolean => exitedPtys.has(term);

/** `process` escalates to the pty's own pid. `group` escalates to its whole process group —
 *  node-pty starts the child with setsid, so the group id IS the pid — which also reaches what the
 *  program started under it, and does so even after the program itself has exited. */
export type PtyKillScope = "process" | "group";

/** Sends `signal` to process group `pgid`, throwing as `process.kill` does (ESRCH: none left). */
export type SignalGroup = (pgid: number, signal: PtyKillSignal | 0) => void;

const signalProcessGroup: SignalGroup = (pgid, signal) => {
  process.kill(-pgid, signal);
};

export interface PtyKillOptions {
  /** Names the pty in the escalation warning: `session <id>`, or `command cell`. */
  label: string;
  scope?: PtyKillScope;
  platform?: NodeJS.Platform;
  graceMs?: number;
  signalGroup?: SignalGroup;
}

function sendKill(term: KillablePty, signal: PtyKillSignal | undefined): void {
  try {
    term.kill(signal);
  } catch {
    // already gone
  }
}

// EPERM means a member exists that we may not signal — still "not empty".
function groupHasMembers(pgid: number, signalGroup: SignalGroup): boolean {
  try {
    signalGroup(pgid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}

function stillRunning(term: KillablePty, options: Required<PtyKillOptions>): boolean {
  return options.scope === "group" ? groupHasMembers(term.pid, options.signalGroup) : !ptyHasExited(term);
}

function sendEscalation(term: KillablePty, signal: PtyKillSignal | undefined, options: Required<PtyKillOptions>): void {
  if (options.scope === "process" || signal === undefined) return sendKill(term, signal);
  try {
    options.signalGroup(term.pid, signal);
  } catch {
    // the group emptied between the check and the signal
  }
}

function escalate(term: KillablePty, remaining: readonly (PtyKillSignal | undefined)[], options: Required<PtyKillOptions>): void {
  const [next, ...rest] = remaining;
  if (remaining.length === 0) return;
  // unref: a pending escalation must not keep a shutting-down server alive.
  setTimeout(() => {
    if (!stillRunning(term, options)) return;
    console.warn(
      `[pty] ${options.label} (${options.scope === "group" ? "process group" : "pid"} ${term.pid}) outlived its kill for ${options.graceMs}ms; sending ${next ?? "kill()"}`,
    );
    sendEscalation(term, next, options);
    escalate(term, rest, options);
  }, options.graceMs).unref();
}

export function killPty(term: KillablePty, options: PtyKillOptions): void {
  if (ptyHasExited(term)) return;
  const resolved: Required<PtyKillOptions> = {
    scope: "process",
    platform: process.platform,
    graceMs: PTY_KILL_GRACE_MS,
    signalGroup: signalProcessGroup,
    ...options,
  };
  const [first, ...rest] = killSignalsFor(resolved.platform);
  sendKill(term, first);
  escalate(term, rest, resolved);
}
