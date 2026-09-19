# fix: the Settings section did not know the sweep can repeat (#2177)

## The gap

#2167 added `sessionReapIntervalHours` on the server. The Settings section that owns the
other half of the same decision was left as it was, and is now wrong in two ways.

**No control.** `settings-coverage.spec.ts` had this key as `{ skill: CONFIG_SKILL }` —
config file only. Its default is `0`, which is OFF, so the feature does not exist for
anyone who has not opened `config.json`. A setting whose default is "does nothing" is the
one that most needs a place to be discovered.

**A row that lies once it is on.** With the repeat armed, a session is ended without
waiting for a restart, and the row still says `ends at next start`. Same class as the
re-read after changing the threshold (CodeRabbit on #1486): the list must not keep showing
an answer that has stopped being true.

This second half is **deferred to #2184**, and the reason is the most useful thing this
change produced. The first attempt keyed the row off the SAVED cadence — which is not what
the running server is doing, because the timer is armed once at boot. That is false in both
directions: false from the moment the number is saved until the next restart, and false the
other way when someone sets it back to `0`. Getting it right needs the server to report the
interval it actually armed, which is a new runtime field on the wire and its own change.

## The change

A second stepper beside the threshold, and a wording branch on the doomed row.

- **Three states on the cadence row**, because two would be misleading: repeating (say how
  often), off (say a running server never looks again), and *the threshold is off* — where
  the stepper is disabled, since a cadence for a sweep that does not run is nothing to set.
- **No list reload when the cadence changes.** The days re-read the rows because `reapable`
  is the server's answer against the old threshold. The cadence does not change WHICH rows
  are reapable, so that answer is still current.
- The default stays `0`. This makes the setting reachable, not enabled.

## Verification

- Specs: the stepper writes its own field and does NOT trigger the threshold's reload; the
  row's wording is INDEPENDENT of the saved cadence (pinned at both 0 and a positive value,
  so the false claim cannot be re-derived); the cadence hint speaks only about the next
  start; the cadence row is disabled and says so when the threshold is off.
- Each break-verified — neutering `sweeping`, neutering `sweepDisabled`, and making the
  stepper save nothing each redden exactly the spec that covers it.
- `settings-coverage` was checked to actually enforce `ui: true` rather than accept the
  claim: marking a display-only key as `ui: true` reddens it.
- The composables are module singletons, so the spec resets both to the shipped defaults in
  `beforeEach` — otherwise one test's cadence leaks into the next.

## Docs

The skill said "config-file only; there is no Settings control" — now false, so it is
rewritten. Neither guide mentioned the key at all (#2167 did not add it), and the section
row describing what Settings carries became stale with this change, so both are updated in
`config.md` for `en` and `ja`.
