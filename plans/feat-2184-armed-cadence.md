# feat: the Settings list learns what cadence this server ARMED (#2184)

## The gap

`sessionReapIntervalHours` is read once, at boot, and the timer is deliberately not re-armed when
the config is POSTed — a stream of edits would reset the countdown forever (#2167). So the saved
number describes a **future** server and the running one describes **this** server, and from a save
until the next restart they are different things.

The browser only ever saw the saved one. #2189 dealt with that honestly, by removing every
present-tense claim: the row names the **event** ("the next sweep ends it"), the hints say what is
**saved**, and one standing line says the cadence is read at startup. All of that is true whatever
was armed — and none of it answers the question the row raises, which is *when*.

## What this adds

The server now reports what it armed, and the standing line says it.

- `reap-schedule.ts` keeps the armed cadence **paired with the timer handle in one value**, so the
  two are set and cleared in the same assignment. The whole difficulty in this area has been a pair
  that drifts; there is now no state where a cadence is reported and nothing is ticking, or the
  reverse. `armedReapIntervalHours()` reads it.
- `/api/tmux/sessions` carries it beside the list. No new route: the section already calls this one,
  and the value is asked for per request rather than captured at mount — a value read once would be
  the boot value forever, which is the mistake being corrected.
- The line states what this process is doing, and adds that the saved cadence applies from the next
  start **only when the two differ**.

## The unknown state is a first-class case, not a default

When the reply does not carry the field — an older server, or a failed read — the value is `null`
and the line falls back to #2189's general sentence. A value the server could not have meant goes to
the same place: the field is held to the standard the rows beside it already set, so `NaN`, an
infinity and a negative are treated as *unanswered* rather than passed through. Each would otherwise
reach the screen as a claim — an infinity renders into the sentence, and `NaN` and a negative both
fall silently to "does not repeat", which states something about the running server instead of
admitting it is not known. It is **never** defaulted to the saved number:
that is precisely the substitution this area exists to stop, and it would read as fact while being
a guess.

That fallback is also why every pre-existing spec in the section still passes untouched: the default
stub answers without the field, so those specs are now the regression test for the older-server path.

## Verification

- The route is pinned twice: it reports the armed value, and it asks for it on **every** request.
- The getter is pinned in both directions, including the one that used to lie — a schedule that arms
  nothing must stop REPORTING as well as stop sweeping.
- Break-verified: substituting the saved value for the armed one in the component reddens the three
  pending cases **and** #2189's three "always says" cases, because the substitution also destroys
  the unknown-state fallback.
