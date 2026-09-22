# @mulmoclaude/core 5 and the eight plugins (#2208)

## Why the nine move together

Each plugin major raises its peer to `@mulmoclaude/core: ^5.x`. Holding core at `^4.10.0`
with new plugins, or new core with old plugins, does not resolve — mulmoclaude measured the
ERESOLVE in the other direction. One `yarn add` for all nine.

## What the upgrade actually broke

`yarn typecheck` against the installed 5.3.0 reports four errors, and `yarn test` one more.
All of them are type WIDENING or a stale guard — core removed no export.

- `server/backends/remoteHost/googleCalendar.spec.ts` — `CalendarEventSummary` grew eight
  required string properties (`recurringEventId`, `originalStartTime`, `updated`,
  `transparency`, `eventType`, `hangoutLink`, `selfResponseStatus`, `conferenceVideoUri`).
  The literal fixture needs them.
- `test/server/backends/calendarPush.spec.ts`, `test/server/backends/calendarPushResult.spec.ts`
  — `CalendarCollectionPushResult` grew `deletedInGoogle`, so the outcome fixtures need it.
  The issue did not predict these two; they appear only once core is installed.
- `test/scripts/mulmoclaudePeerRanges.spec.ts` — see below. Not a type error, and the issue
  did not predict it either.

## The part that is not a type error

`server/backends/calendarPushResult.ts` destructures the engine's result into our own body,
so a field the destructure does not name is dropped in silence. `deletedInGoogle` is such a
field, and `common/collectionPush.ts` exists precisely so that both hosts answer the same
plugin identically — MulmoClaude's `CollectionPushBody` already carries it.

So: add the key to `CollectionPushResult`, pass it through both the `pushed` branch and
`empty()`, and correct the `localDeletes` comment, which asserted that a push never deletes in
Google. With `propagateDeletes` that is no longer true.

The plugin's shipped `CollectionView` does not yet render the count — it exports
`pushWroteSomething`, which reads `deletedInGoogle ?? 0`, but the view still formats only the
four original counts. Carrying the field is what makes our body identical to MulmoClaude's and
lets that helper answer truthfully; it does not change the on-screen message today.

## The peer-range guard, and why the upgrade falsified its premise

`mulmoclaudePeerRanges.spec.ts` recorded that collection-plugin alone declared core as a PEER
while the rest declared it as a DEPENDENCY and got their own nested copy. After the upgrade
**every** plugin declares core as a peer and none nests — so all of them are now breakable by
the core this repo pins, not just one. The header said the opposite, which is the kind of
stale prose a reader would act on, so it is rewritten rather than left.

The failure itself was the floor check reading `^4.2.0` through `satisfiesCaret`, which is
major-bound: a floor is not. A separate `atLeast` answers it, so the check survives the next
major instead of going red for no reason. `satisfiesCaret` keeps its own job (a declared peer
range) and only shares the triple parser.

## Verification

- `yarn format` / `yarn lint` / `yarn typecheck` / `yarn build` / `yarn test`, then again from
  `rm -rf node_modules && yarn install --frozen-lockfile` — a lockfile change is only proved by
  a clean resolve, not by the warm tree that produced it.
- `satisfiesCaret` before and after the parser extraction, over generated triples plus
  malformed shapes, compared whole.
- The app itself, on a scratch `HOME` with a seeded collection: the collection pane's table,
  calendar and kanban views; the push button, which reaches the route this change touches and
  reports our own not-linked wording; the accounting pane creating a ledger and routing to
  opening balances. `scripts/ci-ws-smoke.mjs` for the PTY path.
