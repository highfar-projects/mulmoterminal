// Dispatch one user task's chat and record the run — the counterpart of MulmoClaude's
// `server/workspace/skills/scheduled-run.ts`, so both hosts write the same state and history for
// a task registered directly on the task-manager (user tasks get no catch-up in either host;
// what they get is a record of every run).
//
// The verdict is the turn's REAL outcome, not "the spawn returned": a scheduled chat can still
// fail its first turn, and recording at dispatch would file that as a successful 8 ms run.
import { recordExternalRun, type TaskSchedule, type TaskTrigger } from "@mulmoclaude/core/scheduler";
import { messageOf } from "../errors.js";

/** Spawn a scheduled chat, returning its session id. `onComplete` fires once, when the session's
 *  turn finishes or its teardown reports failure. Throws when the spawn itself fails. */
export type ScheduledChatSpawn = (message: string, onComplete?: (outcome: { didError: boolean }, chatSessionId: string) => void | Promise<void>) => string;

export interface ScheduledDispatch {
  /** Task-manager id (`user.<id>`) — the key its state and log entries are filed under. */
  id: string;
  name: string;
  schedule: TaskSchedule;
  message: string;
  trigger: TaskTrigger;
  spawnChat: ScheduledChatSpawn;
}

/** Dispatch the task's chat, recording either the dispatch failure or the turn's outcome.
 *  Rethrows a dispatch failure so the task-manager tick logs it too. */
export async function fireScheduledChat(dispatch: ScheduledDispatch): Promise<string> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  try {
    // No register-before-dispatch dance is needed here (MulmoClaude's `startChat` is async and can
    // finish before it returns): this spawn is synchronous and registers the hook itself.
    return dispatch.spawnChat(dispatch.message, (outcome, chatSessionId) =>
      recordRun(dispatch, startedAt, startMs, outcome.didError ? `${dispatch.name} run did not complete successfully` : null, chatSessionId),
    );
  } catch (err) {
    await recordRun(dispatch, startedAt, startMs, messageOf(err), undefined);
    throw err;
  }
}

/** Persist one run's state + history entry. `runError` null = success. */
async function recordRun(
  dispatch: ScheduledDispatch,
  startedAt: string,
  startMs: number,
  runError: string | null,
  chatSessionId: string | undefined,
): Promise<void> {
  await recordExternalRun({
    id: dispatch.id,
    name: dispatch.name,
    schedule: dispatch.schedule,
    scheduledFor: startedAt,
    startedAt,
    durationMs: Date.now() - startMs,
    trigger: dispatch.trigger,
    errorMessage: runError,
    chatSessionId,
  });
}
