import { feedRefreshTaskDef } from "@mulmoclaude/core/feeds/server";
import { googleCalendarSyncTaskDef } from "@mulmoclaude/core/google";
import type { SystemTaskDef } from "@mulmoclaude/core/scheduler";
import { worklogSystemTask } from "./worklog.js";
import type { ScheduledChatSpawn } from "./scheduled-run.js";

export interface SystemTaskDeps {
  workspaceRoot: string;
  worklog: { enabled: boolean; intervalHours: number };
  spawnChat: ScheduledChatSpawn;
}

// The system tasks a standalone MulmoTerminal registers — the ones that must keep running with no
// MulmoClaude on the machine. Both shared ones come from a core factory so the id, schedule and run
// can't drift between the two hosts.
//
// Feed refresh and calendar sync are safe to run alongside MulmoClaude on the same workspace
// because each engine soft-dedups on a marker IN that workspace: feeds on `lastFetchedAt`, calendar
// on `lastSyncedAt` (core >= 1.12.0, receptron/mulmoclaude#2678). Whoever gets there first claims
// it and the other skips. That only holds while both hosts point at the SAME workspace root — the
// marker is workspace state, so two roots means no dedup.
//
// Calendar claims at START rather than on success: since `autoPush` the run writes to Google, and
// a first full walk takes minutes, which would otherwise sit open for the other host to enter.
//
// Extracted from index.ts so the list is a value a spec can read. It went months missing the
// calendar task with nothing to notice (#1191).
//
// `SystemTaskDef`, not `TaskDefinition`: the extra `name` + `missedRunPolicy` are what the
// persistence adapter needs to catch a task up after the server was off. Both core factories
// already returned them — this host used to throw them away, so nothing was ever caught up
// and a missed window was skipped forever (#1581).
export function buildSystemTasks(deps: SystemTaskDeps): SystemTaskDef[] {
  return [
    feedRefreshTaskDef({ workspaceRoot: deps.workspaceRoot }),
    googleCalendarSyncTaskDef({ workspaceRoot: deps.workspaceRoot }),
    worklogSystemTask({ ...deps.worklog, spawnChat: deps.spawnChat }),
  ].filter((task): task is SystemTaskDef => task !== null);
}
