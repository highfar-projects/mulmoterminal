// The agent-ingest worker the feeds engine (collection Refresh) dispatches.
//
// It is MulmoTerminal's own session spawn adapted to @mulmoclaude/core/feeds' AgentWorkerRunner
// shape and injected, so the feeds backend never imports the session layer.
import { randomUUID } from "node:crypto";
import type { AgentWorkerRunner } from "@mulmoclaude/core/feeds/server";
import { feedWorkerSpawnOptions } from "./feed-worker-options.js";
import { runWithHiddenMarker } from "../session/hiddenMarker.js";
import { registerCompletionHook } from "../session/completion-hooks.js";
import { backgroundMarkers } from "../session/registry.js";
import type { SpawnClaudePty } from "../session/spawn-claude.js";
import { messageOf } from "../errors.js";

export interface FeedsWorkerDeps {
  spawnClaudePty: SpawnClaudePty;
  /** Put a hidden session on the scheduled-session retention (#541). Called lazily: the registry
   *  this reaches is built later in the boot than the backend that takes this runner. */
  retain: (sessionId: string) => void;
}

/** A MANUAL refresh spawns a VISIBLE session (hidden:false) the user can watch, and the engine
 *  sends no `onComplete` for one — watching it IS the report. `roleId` is ignored (no role system).
 *
 *  A hidden one gets two things a watched session doesn't need. It goes on the scheduled-session
 *  retention (#541), because the chat list keeps it behind the Background filter so nobody is
 *  waiting for it to finish and nothing else would ever end it. And it carries the engine's
 *  completion hook (#1070), which is what turns a failed refresh into a bell instead of silence. */
export function createFeedsWorker({ spawnClaudePty, retain }: FeedsWorkerDeps): AgentWorkerRunner {
  return async ({ message, hidden, onComplete, workspaceRoot }) => {
    const sessionId = randomUUID();
    try {
      // SPAWNED IN THE ROOT THE REFRESH IS FOR (core >= 3.2.0) — see feed-worker-options.ts for why
      // that one option is the difference between refreshing a project and filling the workspace's
      // same-named collection instead.
      runWithHiddenMarker(hidden, sessionId, backgroundMarkers, () => spawnClaudePty(sessionId, null, null, feedWorkerSpawnOptions(message, workspaceRoot)));
      if (hidden) retain(sessionId);
      // AFTER a successful spawn: a launch that threw has no session to report on, and registering
      // first would leave a hook nothing will ever fire or clear.
      if (hidden && onComplete) registerCompletionHook(sessionId, onComplete);
      return { ok: true, chatId: sessionId };
    } catch (err) {
      return { ok: false, error: messageOf(err) };
    }
  };
}
