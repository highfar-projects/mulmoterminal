// The one call that wires the scheduler at boot.
//
// Its own module because the WHY of each argument is far longer than the call, and
// server/index.ts is the worst place for that comment mass: none of it is boot ORDER, which is
// what a reader of index.ts is there for. It moved when #2015 and #2024 each added a line and the
// file — already at its 600-line budget — went over on the two together.
import { CLAUDE_CWD, MULMOTERMINAL_HOME } from "../config/env.js";
import { getWorklogConfig, getSystemTaskSwitches, onSystemTaskSettingsChanged } from "../config/config-routes.js";
import { buildSystemTasks } from "./system-tasks.js";
import { initUserTaskScheduler, reconcileSystemTasks } from "./scheduler.js";
import type { ScheduledChatSpawn } from "./scheduled-run.js";

/** Register the system + user tasks and start the tick loop.
 *
 *  Non-fatal by design: a scheduler that cannot wire itself must not stop the server coming up,
 *  so a failure here leaves a booted app with no scheduled tasks rather than no app.
 *
 *  Call AFTER the feeds / google / collections backends are configured — both shared engines run
 *  through them, and a task registered before they exist would fail on its first tick. */
export function initScheduling(deps: { spawnChat: ScheduledChatSpawn; projectRoots: () => string[] }): void {
  try {
    initUserTaskScheduler({
      workspace: CLAUDE_CWD,
      spawnChat: deps.spawnChat,
      systemTasks: currentSystemTasks(deps),
      home: MULMOTERMINAL_HOME,
    });
    // A save in Settings that moves one of the switches rebuilds the set from the config as it is
    // NOW — the same answer a restart would reach, without one (#2626).
    onSystemTaskSettingsChanged(() => void reconcileSystemTasks(currentSystemTasks(deps)));
  } catch (err) {
    console.error("[scheduler] init failed (non-fatal)", err);
  }
}

// Which tasks and why: system-tasks.ts.
function currentSystemTasks(deps: { spawnChat: ScheduledChatSpawn; projectRoots: () => string[] }) {
  return buildSystemTasks({
    workspaceRoot: CLAUDE_CWD,
    // Every project the server serves gets its feeds refreshed on schedule, not just the
    // workspace — the same set the collection watchers mount for. Asked each time the set is
    // built, so a directory saved since boot is picked up by the next rebuild.
    //
    // This waited on core 3.2.0. An `ingest.kind: "agent"` collection refreshes by dispatching
    // a worker whose seed prompt addresses records ROOT-RELATIVELY, and the runner used to be
    // handed no root — so a project's scheduled refresh resolved `data/collections/<slug>/items`
    // against the WORKSPACE and wrote there instead. It shipped once and was reverted for
    // exactly that (#1582); `feedsSpawnWorker` now spawns in the root core gives it.
    feedRoots: deps.projectRoots(),
    worklog: getWorklogConfig(),
    enabled: getSystemTaskSwitches(),
    spawnChat: deps.spawnChat,
  });
}
