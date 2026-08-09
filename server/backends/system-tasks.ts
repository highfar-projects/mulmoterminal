import path from "node:path";
import { feedRefreshTaskDef } from "@mulmoclaude/core/feeds/server";
import { googleCalendarSyncTaskDef } from "@mulmoclaude/core/google";
import type { TaskDefinition } from "@mulmoclaude/core/scheduler";
import { worklogSystemTask } from "./worklog.js";

export interface SystemTaskDeps {
  workspaceRoot: string;
  /** Every root whose feeds should refresh on a schedule — the workspace plus each saved project
   *  directory. Omitted, only the workspace refreshes, which is what a single-root host wants and
   *  what this did before projects existed.
   *
   *  A root NOT in this list is never refreshed on a schedule; its feeds update only when someone
   *  asks. That is the whole reason the list is passed in rather than inferred here — core says so
   *  explicitly, and it is the host's decision. */
  feedRoots?: string[];
  worklog: { enabled: boolean; intervalHours: number };
  spawnChat: (message: string) => void;
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
export function buildSystemTasks(deps: SystemTaskDeps): TaskDefinition[] {
  return [
    // ONE PER ROOT. A task id is the scheduler's primary key and `feedRefreshTaskDef` builds it
    // from the root, so N roots register N tasks instead of overwriting each other down to the
    // last one. Deduped by resolved path: the workspace is usually a saved directory too, and
    // registering it twice would refresh it twice an hour.
    ...feedRootsOf(deps).map((root) => feedRefreshTaskDef({ workspaceRoot: root })),
    // The calendar stays WORKSPACE-ONLY, deliberately. A Google grant is user-scope and its sync
    // state (`lastSyncedAt`) is workspace state, so a per-project sync would need a per-project
    // answer to "which account" that nothing in this app has. A project's calendar collections
    // still sync on demand.
    googleCalendarSyncTaskDef({ workspaceRoot: deps.workspaceRoot }),
    worklogSystemTask({ ...deps.worklog, spawnChat: deps.spawnChat }),
  ].filter((task): task is TaskDefinition => task !== null);
}

/** The roots to register a feed refresh for, workspace first and each one once.
 *
 *  Resolved before deduping because the workspace and a saved directory can spell the same
 *  folder differently (a trailing slash, a `.` segment) — and `feedRefreshTaskDef` canonicalises
 *  the root into the id, so two spellings would produce ONE id and silently drop a registration
 *  rather than two tasks. */
function feedRootsOf(deps: SystemTaskDeps): string[] {
  const roots = [deps.workspaceRoot, ...(deps.feedRoots ?? [])].map((root) => path.resolve(root));
  return [...new Set(roots)];
}
