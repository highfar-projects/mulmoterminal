# feat: the idle-session sweep cadence applies without a restart (#2626, part 2)

Part of #2616; the second half of #2626 (the first, the system tasks, is #2645).

## What

A `sessionReapIntervalHours` saved while the server runs re-arms the sweep at once
(`rearmReapSchedule`), told through the same `notifySavedChanges` the system tasks use — so a
Settings save and a config reload (#2663) both reach it. Settings re-asks for the armed cadence after
a save, and its copy no longer says the change waits for the next start.

## Decisions

- **Counted from the LAST sweep, not from the save** (`nextSweepDelayMs`, pure). #2167 declined
  re-arming on a save because a stream of edits would keep resetting the countdown; measured from
  the last sweep, the next one lands at the same moment however often the cadence is saved, and a
  shorter cadence that is already overdue sweeps at once.
- **The arming is a timeout then an interval.** The first sweep after a re-arm waits the rest of an
  interval; each after that a whole one. At boot the first wait is a whole interval, as before.
- **Re-arming the same cadence is not special-cased**: counted from the last sweep it lands on the same
  moment, so it changes nothing.

## Verification

- `reap-schedule.spec.ts`: longer cadence counted from the last sweep, overdue shorter cadence sweeps
  at once, repeated saves do not push the sweep back, same cadence leaves it, off stops, on arms;
  `nextSweepDelayMs`. The existing boot-arming cases pass unchanged.
- `system-task-settings-route.spec.ts`: a save that moves the cadence passes it on, one that does not
  says nothing.
- `survivingSessionsSection.spec.ts`: the section re-asks for the armed cadence after a save; the
  copy cases updated to the new wording.
- Each decision was inverted and the specs went red.
