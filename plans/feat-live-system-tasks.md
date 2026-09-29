# feat: system-task settings apply without a restart (#2626, part 1)

Part of #2616. The first half of #2626: `worklogEnabled`, `worklogIntervalHours`,
`feedRefreshEnabled` and `calendarSyncEnabled`. The session-sweep cadence
(`sessionReapIntervalHours`) is the second half, in its own PR, because it needs a different
mechanism (below).

## What

A save through `POST /api/config` that moves one of the four rebuilds the scheduler's built-in
tasks in the running server:

- `config-routes.ts` compares the in-memory config before and after the save
  (`systemTaskSettingsChanged`, pure) and tells one listener.
- `scheduler-boot.ts` registers that listener at boot; it rebuilds the task set from the config
  and the project list as they are now (`currentSystemTasks`), the answer a restart would reach.
- `scheduler.ts` `reconcileSystemTasks` removes the registered system tasks and hands the new set to
  the adapter (`startSystemTaskScheduler`), which re-seeds and re-registers them.

## Decisions

- **Every replacement is queued behind the previous one, boot included.** The task-manager throws
  on a second registration of one id, and a boot catch-up can still be running when a save lands.
  Consequence: if the boot catch-up never finishes, a later save waits behind it.
- **Re-registering does not restart a countdown.** The task-manager decides "due" from the wall
  clock, not from when a task was registered — which is also why the session-sweep cadence is NOT
  done this way: it is a `setInterval`, and re-arming it on every save would reset it forever, the
  reason #2167 declined exactly that.
- **The adapter re-runs its catch-up on each rebuild**, as a restart would. A newly enabled task is
  seeded first, so switching the worklog on does not run it at once.
- **A save that moves none of the four does nothing**, including re-saving the same value.
- **A hand-edit of the file still waits for a restart**: nothing reads the file while the server
  runs. #2627 is that.

## Verification

- Specs: `system-task-settings.spec.ts` (pure), `system-task-settings-route.spec.ts` (the POST tells
  the listener only on a move, and a throwing listener still answers 200),
  `scheduler-reconcile.spec.ts` against the REAL task-manager and adapter (add, remove, new interval,
  start from an empty boot, overlapping rebuilds end on the last). Each decision was inverted and
  the specs went red.
- A real server with a scratch HOME: `/api/scheduler/tasks` followed each POST without a restart
  (worklog on, feed and calendar off, interval changed, all restored), and enabling the worklog
  seeded its state rather than running it.
