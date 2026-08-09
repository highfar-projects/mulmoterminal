// @vitest-environment node
// What a standalone MulmoTerminal registers with the scheduler.
//
// Pinned by id, not by count: the calendar sync was absent for months with nothing to notice
// (#1191), because index.ts built the list inline and no spec could read it.
import { describe, it, expect } from "vitest";

import { buildSystemTasks } from "../../../server/backends/system-tasks.js";

const WORKLOG_OFF = { enabled: false, intervalHours: 6 };
const build = (worklog = WORKLOG_OFF) => buildSystemTasks({ workspaceRoot: "/ws", worklog, spawnChat: () => {} });

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

  // Off is the default, so the list must not carry a null through to registerTask.
  it("leaves the worklog out until it is enabled", () => {
    expect(build().map((task) => task.id)).not.toContain("system.worklog");
    expect(build({ enabled: true, intervalHours: 6 }).map((task) => task.id)).toContain("system.worklog");
  });

  it("returns no nulls", () => {
    expect(build().every(Boolean)).toBe(true);
  });
});
