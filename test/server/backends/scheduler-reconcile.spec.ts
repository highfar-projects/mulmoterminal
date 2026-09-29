// @vitest-environment node
//
// #2626. The system tasks are rebuilt in a running server when a setting they are built from moves.
// Against the REAL task-manager and adapter: what can go wrong is theirs — a second registration of
// one id throws, and the adapter's list is what /api/scheduler/tasks reports.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MISSED_RUN_POLICIES, SCHEDULE_TYPES } from "@receptron/task-scheduler";
import type { ITaskManager, SystemTaskDef } from "@mulmoclaude/core/scheduler";

const created = vi.hoisted(() => ({ managers: [] as ITaskManager[] }));
vi.mock("@mulmoclaude/core/scheduler", async (importOriginal) => {
  const real = await importOriginal<typeof import("@mulmoclaude/core/scheduler")>();
  return {
    ...real,
    // The real one, kept so the spec can ask it what is registered and whether it was started.
    createTaskManager: (...args: Parameters<typeof real.createTaskManager>) => {
      const manager = real.createTaskManager(...args);
      const started = { value: false };
      const watched: ITaskManager = {
        ...manager,
        start: () => {
          started.value = true;
          manager.start();
        },
      };
      Object.defineProperty(watched, "started", { get: () => started.value });
      created.managers.push(watched);
      return watched;
    },
  };
});

const { initUserTaskScheduler, reconcileSystemTasks, resetLiveSchedulerForTesting } = await import("../../../server/backends/scheduler.js");
const { getSchedulerTasks, resetSchedulerForTesting } = await import("@mulmoclaude/core/scheduler");

const dirs: string[] = [];
afterEach(() => {
  created.managers.forEach((manager) => manager.stop());
  created.managers.length = 0;
  resetLiveSchedulerForTesting();
  resetSchedulerForTesting();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const HOUR_MS = 3_600_000;
const task = (id: string, intervalHours = 1): SystemTaskDef => ({
  id,
  name: id,
  description: id,
  schedule: { type: SCHEDULE_TYPES.interval, intervalMs: intervalHours * HOUR_MS },
  missedRunPolicy: MISSED_RUN_POLICIES.skip,
  run: vi.fn(async () => {}),
});

function boot(systemTasks: SystemTaskDef[]): ITaskManager {
  const workspace = mkdtempSync(path.join(tmpdir(), "mt-reconcile-"));
  dirs.push(workspace);
  initUserTaskScheduler({ workspace, spawnChat: () => "session", systemTasks, home: workspace });
  const manager = created.managers.at(-1);
  if (!manager) throw new Error("no task manager was created");
  return manager;
}

const registered = (manager: ITaskManager) =>
  manager
    .listTasks()
    .map((summary) => summary.id)
    .sort();
const reported = () =>
  getSchedulerTasks()
    .map((entry) => entry.id)
    .sort();
const started = (manager: ITaskManager) => Reflect.get(manager, "started") === true;

describe("reconcileSystemTasks", () => {
  it("adds a task to a running set without registering the others twice", async () => {
    const manager = boot([task("system.a")]);
    await reconcileSystemTasks([]); // waits for the boot registration queued ahead of it
    await reconcileSystemTasks([task("system.a"), task("system.b")]);
    expect(registered(manager)).toEqual(["system.a", "system.b"]);
    expect(reported()).toEqual(["system.a", "system.b"]);
  });

  it("removes a task that was switched off, from the manager and from what the API reports", async () => {
    const manager = boot([task("system.a"), task("system.b")]);
    await reconcileSystemTasks([task("system.b")]);
    expect(registered(manager)).toEqual(["system.b"]);
    expect(reported()).toEqual(["system.b"]);
    await reconcileSystemTasks([]);
    expect(registered(manager)).toEqual([]);
    expect(reported()).toEqual([]);
  });

  it("applies a new interval to a task that stays registered", async () => {
    const manager = boot([task("system.worklog", 6)]);
    await reconcileSystemTasks([task("system.worklog", 12)]);
    expect(manager.listTasks().map((summary) => summary.schedule)).toEqual([{ type: SCHEDULE_TYPES.interval, intervalMs: 12 * HOUR_MS }]);
  });

  it("starts ticking when a server that booted with nothing to schedule is given a task", async () => {
    const manager = boot([]);
    expect(started(manager)).toBe(false);
    await reconcileSystemTasks([task("system.a")]);
    expect(started(manager)).toBe(true);
    expect(registered(manager)).toEqual(["system.a"]);
  });

  it("runs overlapping rebuilds one after the other, ending on the last", async () => {
    const manager = boot([task("system.a")]);
    const rebuilds = [[task("system.a"), task("system.b")], [task("system.b")], [task("system.a"), task("system.c")]].map((set) => reconcileSystemTasks(set));
    await Promise.all(rebuilds);
    expect(registered(manager)).toEqual(["system.a", "system.c"]);
    expect(reported()).toEqual(["system.a", "system.c"]);
  });

  it("does nothing before the scheduler has booted", async () => {
    await expect(reconcileSystemTasks([task("system.a")])).resolves.toBeUndefined();
    expect(created.managers).toHaveLength(0);
  });
});
