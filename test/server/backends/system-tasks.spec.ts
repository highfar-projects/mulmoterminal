// @vitest-environment node
// What a standalone MulmoTerminal registers with the scheduler.
//
// Pinned by id, not by count: the calendar sync was absent for months with nothing to notice
// (#1191), because index.ts built the list inline and no spec could read it.
import { describe, it, expect } from "vitest";

import { buildSystemTasks } from "../../../server/backends/system-tasks.js";

const WORKLOG_OFF = { enabled: false, intervalHours: 6 };
const build = (worklog = WORKLOG_OFF) => buildSystemTasks({ workspaceRoot: "/ws", worklog, spawnChat: () => {} });
const buildWithRoots = (feedRoots: string[]) => buildSystemTasks({ workspaceRoot: "/ws", feedRoots, worklog: WORKLOG_OFF, spawnChat: () => {} });
const feedIds = (tasks: ReturnType<typeof buildSystemTasks>) => tasks.map((task) => task.id).filter((id) => id.startsWith("system:feed-refresh"));

describe("buildSystemTasks", () => {
  // The feed-refresh id carries its ROOT since core 3.1.0 — the task def is per root, so two
  // roots would otherwise register one id and the second would replace the first. MulmoTerminal
  // registers one (the workspace) today, and does not persist system-task state, so there is no
  // stale row from the old id to clean up.
  it("registers both shared engines, the feed refresh keyed by its root", () => {
    const ids = build().map((task) => task.id);
    expect(ids).toContain("system:feed-refresh:/ws");
    expect(ids).toContain("system:google-calendar-sync");
  });

  // A project's feeds never refreshed on their schedule while this registered one root.
  it("registers one feed refresh per root, so a project's feeds refresh too", () => {
    expect(feedIds(buildWithRoots(["/ws", "/srv/mag2"]))).toEqual(["system:feed-refresh:/ws", "system:feed-refresh:/srv/mag2"]);
  });

  it("keeps the workspace even when it is not among the roots passed in", () => {
    expect(feedIds(buildWithRoots(["/srv/mag2"]))).toEqual(["system:feed-refresh:/ws", "system:feed-refresh:/srv/mag2"]);
  });

  // A task id is the scheduler's primary key, and the id is built from the CANONICAL root — so
  // two spellings of one directory make one id, and the second registration would replace the
  // first rather than add to it. The dedup has to happen on the resolved path, before that.
  it("registers a directory once however it is spelled", () => {
    expect(feedIds(buildWithRoots(["/ws/", "/srv/mag2", "/srv/mag2/./"]))).toEqual(["system:feed-refresh:/ws", "system:feed-refresh:/srv/mag2"]);
  });

  it("refreshes only the workspace when no roots are given — the pre-projects behaviour", () => {
    expect(feedIds(build())).toEqual(["system:feed-refresh:/ws"]);
  });

  // Workspace-only, deliberately: a Google grant is user-scope and its sync marker is workspace
  // state, so there is no per-project answer to "which account".
  it("does not multiply the calendar sync per root", () => {
    const ids = buildWithRoots(["/ws", "/srv/mag2"]).map((task) => task.id);
    expect(ids.filter((id) => id.startsWith("system:google-calendar-sync"))).toEqual(["system:google-calendar-sync"]);
  });

  // Off is the default, so the list must not carry a null through to registerTask.
  it("leaves the worklog out until it is enabled", () => {
    expect(build().map((task) => task.id)).not.toContain("system.worklog");
    expect(build({ enabled: true, intervalHours: 6 }).map((task) => task.id)).toContain("system.worklog");
  });

  it("returns no nulls", () => {
    expect(build().every(Boolean)).toBe(true);
  });
});
