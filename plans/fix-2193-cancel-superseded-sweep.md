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

Cancellation is its own step, `stopArmedTimer()`, and `startReapSchedule` runs it **first** —
before the immediate sweep and before any decision about what to arm next.

The ordering is the whole subtlety, and there are two separate ways to never reach a cancellation
placed later:

- **The enabled check.** A cadence of nought returns early from `armTimer`, so a clear sitting
  below that check is skipped by exactly the call that means "stop sweeping".
- **The immediate sweep.** `startReapSchedule` sweeps before it arms, and that sweep is fallible —
  tmux can be gone, the threshold unreadable. A clear sitting after it is skipped whenever it
  throws.

Both leave the previous interval ending sessions on a cadence the caller has just replaced, which
is the defect rather than a variant of it. Putting the cancellation ahead of both is what makes
"a new schedule supersedes the old one" true regardless of what the rest of the call does.

Production is unaffected either way: the single caller runs at boot with nothing armed yet, so
`stopArmedTimer()` is a no-op there and the boot path behaves exactly as before.

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
- A third spec covers the fallible half: a replacing schedule whose own sweep throws must still
  have stopped the previous one. It was **reproduced before being accepted** — sweeps kept firing
  on the cancelled cadence after the replacing call threw.
- Break-verified, each mutation's application asserted by count before running and the file
  restored byte-identically after: deleting the cancellation reddens every cancellation spec, and
  moving it to *after* the immediate sweep reddens exactly the throwing one. The second mutation
  is the one that matters — it shows the new spec pins the ordering against fallible work rather
  than cancellation in general.
