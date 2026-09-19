# fix: a second schedule must STOP the first (#2193)

## The defect

`armTimer` keeps its `setInterval` handle in a local `const`, and nothing in the repo calls
`clearInterval`. So a second `startReapSchedule` starts a new sweep without stopping the
previous one:

```
startReapSchedule(6)   →  a six-hour interval begins
startReapSchedule(0)   →  "do not repeat" … and the six-hour interval keeps firing
```

Reproduced with fake timers before anything was changed: advancing the clock six hours after
the OFF call fired a sweep.

## Honest blast radius

**Production does not hit this today.** `startReapSchedule` has exactly one caller —
`server/infra/on-listening.ts` — and it runs once per process.

So this is idempotence, not a live user-facing bug. It is worth fixing anyway because the
function is **exported**, nothing expresses a once-only contract, and the failure mode is the
quiet kind: a duplicated sweep ends sessions on a cadence nobody asked for.

## The change

`armTimer` clears any previous interval **before** it decides whether to arm a new one.

The ordering is the whole subtlety. Clearing *after* the `reapTimerEnabled` check would miss
the reported case exactly — the second call arms nothing and returns early, leaving the first
interval running. A mutation moving the clear below that check reddens precisely the spec for
the OFF case and nothing else.

## Not the live re-arming #2167 declined

#2167 deliberately does not re-arm on a config POST, because a stream of edits would reset the
countdown forever. This stops a timer only when a caller explicitly starts a new schedule; no
config path reaches it.

## Verification

- Two specs, both watching the **clock** rather than any status value: no sweep fires after an
  OFF call, and a 6h schedule replaced by 2h leaves exactly three ticks in six hours.
- Watching the clock is the point. A number-only assertion — "nothing reports a cadence" — is
  true the instant the second call returns while the first interval is still alive, which is
  how this hid in review once already.
- Both break-verified, each mutation's application asserted by count before running: removing
  the cancellation reddens both specs; moving it below the enabled check reddens the OFF case.
