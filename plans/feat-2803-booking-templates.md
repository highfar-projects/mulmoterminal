# feat: shared-app templates for a class with a capacity, and a scheduling poll (#2803)

## Goal

Two templates buildable with today's declaration vocabulary — no `firestore.rules` change, no
publisher change:

1. `class-seats.md` — a class with N places, booked first come, visitors see "N left" and never who.
2. `schedule-poll.md` — 調整さん / Doodle: candidate dates, ○/△/× per date, everyone sees the table,
   a participant corrects their own answer, the organiser closes it.

## Decisions

- **Capacity is N seat documents, not a counter.** Each seat is a meeting-room slot: booking id =
  seat id (`idFrom: "field"`), `idIn` open seats, `mirror` / `mirrorOf`. A second booking of one seat
  is a create on an existing document and is refused. "N left" is the view counting open seats.
  Names stay hidden because only `classes` and `seats` are in `public.read`.
- **The window refs the SEAT** (`opensAt` / `closesAt` copied onto every seat of a class). A ref to
  the class would be a visitor-supplied field nothing checks against the seat.
- **Collisions are retried by the visitor, not by the page.** One press = one `submit()`; on a
  refusal the page drops that seat from its own candidates and asks the visitor to press again.
  The seat is picked at random among open seats so two visitors rarely pick the same one.
- **One person taking two seats is not prevented** (not required).
- **Poll answers are one per participant per poll**: `auth: "anonymous"`, `idFrom: "auth.uid+field"`,
  `idField: "pollId"`. Marks for all dates live in one string field (`marks`, one character per date
  in the poll's order), because candidate dates vary per poll and `createFields` is a fixed list.
- **Correction** is `selfUpdate` (needs a `statusField` with one state `answered`), reached with
  `view.correct`. The own row comes from `viewer.mine` / `view.mine("answers", pollId)`.
- **Closing is time-based** (`window.untilField` → `polls.closesAt`), which binds both new answers
  and corrections. No status-based close.

## Verification

- `test/server/backends/skillTemplates.spec.ts`: both templates registered and run through the real
  publish gate (`declarationProblems`), plus the existing sandbox / canvas / hue / page checks.
- A jsdom spec that RUNS the public pages: remaining count, names never drawn, a refused seat is not
  retried, cancel is silent; the poll page fills the visitor's own row and corrects instead of
  re-submitting.
- `meeting-room.md`'s "capacity >= 2 cannot be written" points at `class-seats.md`; `SKILL.md` lists both.
