// Which config keys decide the scheduler's SYSTEM tasks, and whether a save moved any of them.
//
// These four are read when the tasks are built (backends/scheduler/system-tasks.ts). A save that moves one
// rebuilds the set (backends/scheduler/scheduler.ts, reconcileSystemTasks); a save that moves none must not,
// because a rebuild re-runs the catch-up plan and a Settings screen POSTs on every click.
export interface SystemTaskSettings {
  worklogEnabled: boolean;
  worklogIntervalHours: number;
  feedRefreshEnabled: boolean;
  calendarSyncEnabled: boolean;
}

const SYSTEM_TASK_KEYS = [
  "worklogEnabled",
  "worklogIntervalHours",
  "feedRefreshEnabled",
  "calendarSyncEnabled",
] as const satisfies readonly (keyof SystemTaskSettings)[];

export const systemTaskSettingsChanged = (before: SystemTaskSettings, after: SystemTaskSettings): boolean =>
  SYSTEM_TASK_KEYS.some((key) => before[key] !== after[key]);
