// Background sessions nobody is waiting for, and what ends them.
//
// Nobody ever presses close on a scheduled session, and one blocked on a permission prompt never
// finishes a turn, so the hook-driven reap can miss it entirely — hence the registry, which bounds
// them by count and age whatever their hooks did (#541).
import { randomUUID } from "node:crypto";
import { createScheduledSessionRegistry, scheduledSessionInUse, scheduledSessionsDir } from "./scheduled-sessions.js";
import { spawnScheduledWorker } from "./scheduled-chat.js";
import { ptys } from "./registry.js";
import type { SpawnClaudePty } from "./spawn-claude.js";
import { tmuxAttachedClientCount, tmuxHasSession, tmuxKillSession } from "../infra/tmux.js";
import { CLAUDE_CWD, MULMOTERMINAL_HOME, SESSION_ID_RE } from "../config/env.js";
import type { ScheduledChatSpawn } from "../backends/scheduled-run.js";

// Sweep at startup (catching sessions that outlived a restart — tmux survives one by design) and
// hourly, so the age cap holds even after the schedule is turned off.
const SCHEDULED_SWEEP_INTERVAL_MS = 60 * 60_000;

// The rule lives with heldByAnotherProcess (pure/tested); this only reads the live facts.
const sessionInUse = (id: string): boolean => {
  const entry = ptys.get(id);
  return scheduledSessionInUse({ hasViewer: !!entry?.ws, weHoldAPty: !!entry }, () => tmuxAttachedClientCount(id));
};

export interface ScheduledSessionsDeps {
  reap: (id: string) => void;
  spawnClaudePty: SpawnClaudePty;
}

export interface ScheduledSessions {
  /** Put a session on the retention. Reached from a request or a feeds refresh, never at boot. */
  register: (sessionId: string) => void;
  /** A user's scheduled task runs as a BACKGROUND WORKER — see scheduled-chat.ts for why, and for
   *  what follows from it (no grid cell, but a failed one still says so).
   *
   *  A failed spawn is left to throw: whichever scheduler dispatched it records the failure and
   *  logs it. Swallowing it here is how a task that never once started looked exactly like a task
   *  that had not come due yet. */
  spawnScheduledChat: ScheduledChatSpawn;
}

/** Builds the registry, sweeps it now, and arms the repeat. */
export function startScheduledSessions({ reap, spawnClaudePty }: ScheduledSessionsDeps): ScheduledSessions {
  const scheduledSessions = createScheduledSessionRegistry({
    dir: scheduledSessionsDir(CLAUDE_CWD, MULMOTERMINAL_HOME),
    isValidId: (id) => SESSION_ID_RE.test(id),
    isInUse: sessionInUse,
    reapSession: reap,
    hasTmux: tmuxHasSession,
    killTmux: tmuxKillSession,
  });
  void scheduledSessions.sweep();
  setInterval(() => void scheduledSessions.sweep(), SCHEDULED_SWEEP_INTERVAL_MS).unref();

  return {
    register: (sessionId) => scheduledSessions.register(sessionId),
    spawnScheduledChat: (message, onComplete) => {
      const sessionId = randomUUID();
      spawnScheduledWorker(sessionId, {
        spawn: (id) => spawnClaudePty(id, null, null, { initialPrompt: message }),
        retain: (id) => scheduledSessions.register(id),
        onComplete,
      });
      return sessionId;
    },
  };
}
