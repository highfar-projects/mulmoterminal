// Ending a pty whose program must not outlive it: SIGHUP, then SIGKILL if the program ignored it.
//
// For a pty that runs the program DIRECTLY. A tmux-backed session's pty is only the tmux client,
// and its program is ended by `tmux kill-session`, not by anything sent to this pid.
import type { IPty } from "node-pty";
import { killSignalsFor, type PtyKillSignal } from "./pty-kill-plan.js";

// Long enough for a shell to run its exit traps, short enough that an ignored SIGHUP does not
// leave a program holding a closed cell's directory for long.
export const PTY_KILL_GRACE_MS = 5_000;

/** The part of a pty this module touches — narrow, so a spec can hand it a fake. */
export type KillablePty = Pick<IPty, "pid" | "kill" | "onExit">;

// Filled from the spawn, not from the kill: a kill can run after the exit (reap is reached from
// onExit), and a listener added then would never fire — so the escalation would signal a pid the
// OS may already have handed to another process.
const exitedPtys = new WeakSet<KillablePty>();

export function trackPtyExit(term: KillablePty): void {
  term.onExit(() => exitedPtys.add(term));
}

export const ptyHasExited = (term: KillablePty): boolean => exitedPtys.has(term);

export interface PtyKillOptions {
  /** Names the pty in the escalation warning: `session <id>`, or `command cell`. */
  label: string;
  platform?: NodeJS.Platform;
  graceMs?: number;
}

function sendKill(term: KillablePty, signal: PtyKillSignal | undefined): void {
  try {
    term.kill(signal);
  } catch {
    // already gone
  }
}

function escalate(term: KillablePty, remaining: readonly (PtyKillSignal | undefined)[], options: Required<PtyKillOptions>): void {
  const [next, ...rest] = remaining;
  if (remaining.length === 0) return;
  // unref: a pending escalation must not keep a shutting-down server alive.
  setTimeout(() => {
    if (ptyHasExited(term)) return;
    console.warn(`[pty] ${options.label} (pid ${term.pid}) outlived its kill for ${options.graceMs}ms; sending ${next ?? "kill()"}`);
    sendKill(term, next);
    escalate(term, rest, options);
  }, options.graceMs).unref();
}

export function killPty(term: KillablePty, options: PtyKillOptions): void {
  if (ptyHasExited(term)) return;
  const resolved: Required<PtyKillOptions> = { platform: process.platform, graceMs: PTY_KILL_GRACE_MS, ...options };
  const [first, ...rest] = killSignalsFor(resolved.platform);
  sendKill(term, first);
  escalate(term, rest, resolved);
}
