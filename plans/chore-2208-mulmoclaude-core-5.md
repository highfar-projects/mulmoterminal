# @mulmoclaude/core 5 and the eight plugins (#2208)

## Why the nine move together

Each plugin major raises its peer to `@mulmoclaude/core: ^5.x`. Holding core on the old line
with new plugins, or new core with old plugins, does not resolve — mulmoclaude measured the
ERESOLVE in the other direction. One `yarn add` for all of them.

## What the upgrade actually broke

`yarn typecheck` and `yarn test` against the installed core report it. All of it is type
WIDENING or a stale guard — core removed no export.

- `server/backends/remoteHost/googleCalendar.spec.ts` — `CalendarEventSummary` grew required
  string properties (`recurringEventId`, `originalStartTime`, `updated`, `transparency`,
  `eventType`, `hangoutLink`, `selfResponseStatus`, `conferenceVideoUri`). The literal fixture
  needs them.
- `test/server/backends/calendarPush.spec.ts`, `test/server/backends/calendarPushResult.spec.ts`
  — `CalendarCollectionPushResult` grew `deletedInGoogle`, so the outcome fixtures need it.
  The issue did not predict these; they appear only once core is installed.
- `test/scripts/mulmoclaudePeerRanges.spec.ts` — see below. Not a type error, and not predicted
  either.

## The part that is not a type error

`server/backends/calendarPushResult.ts` destructures the engine's result into our own body, so
a field the destructure does not name is dropped in silence. `deletedInGoogle` is such a field,
and `common/collectionPush.ts` exists precisely so that both hosts answer the same plugin
identically — MulmoClaude's `CollectionPushBody` already carries it.

So: add the key, pass it through both the `pushed` branch and `empty()`, and correct the
`localDeletes` comment, which asserted that a push never deletes in Google. With
`propagateDeletes` that is no longer true.

**Nothing upstream was going to catch this.** The plugin does not export its own
`CollectionPushResult` (it exports the refresh one, not this one), so there is no shape to check
against; and the `collectionUi.ts` binding only catches a field the plugin declares REQUIRED,
while every field it adds is optional so an older host still parses. So the fix is not only the
field — it is the key-set assertion in the shaper's spec, which makes the next dropped field a
type error. Proved by deleting `deletedInGoogle` from the body type again: the assertion is what
goes red.

The sibling `calendarRefreshResult.ts` deliberately does NOT get the same assertion. It is not a
key-for-key mapping: it merges the feed arm and the calendar arm into one body, folds
`unwritable` into `errors` and drops `withheld` on purpose, so an exact key-set match would
assert something untrue.

## The peer-range guard, and the premise that was never true

The file recorded that collection-plugin alone declared core as a PEER while the rest declared
it as a DEPENDENCY and got their own nested copy.

**The upgrade did not falsify that — it was already false.** Reading the pre-upgrade manifests
back off npm: every one of the eight declared core in `peerDependencies` only, none in
`dependencies`, and nothing nested. The header had been stale for several releases and the guard
beside it never noticed, which is the exact failure the file exists to prevent. A first pass at
this change said the upgrade changed the regime; it did not, and the commit that says so is
wrong about it.

That is what the rewrite is really for. Three things it fixes, none of which the red test named:

- **The check read yarn's OUTPUT.** Yarn nests a copy only on a version CONFLICT, so a package
  that moved core to a dependency at the range already pinned here would be hoisted and look
  exactly like a peer. It now reads the DECLARATION, which is what the prose claims.
- **The filter was `*-plugin`, and that is how a consumer drifts unseen.** `@receptron/sharedapp`
  names core too, at a peer range the new core does not satisfy — it is the one package this
  upgrade put out of range, and nothing reported it. The guard now reads every direct dependency
  that names core, with sharedapp's drift RECORDED so both directions fail: a new drift has to be
  judged, and a fixed one has to lose its entry. It still loads and the three symbols it imports
  still resolve, checked by importing it; there is no newer release to move to.
- **The floor could no longer fail.** Every declared range already forbids falling below it, and
  a version floor passes a core that kept the number and renamed the export — which is the
  failure it was written for. It now asks for the symbol, `isCanonicalServerTime`. That removed
  the version comparator a first pass added, so `satisfiesCaret` is back to what it was.

## The remote-host wire widened, and nothing here said so

`server/backends/remoteHost/googleCalendar.ts` answers `{ ...event }`, so what the paired phone
receives over Firestore is decided by whatever `CalendarEventSummary` holds. Widening it
published three new fields — `hangoutLink` (the Meet join URL), `conferenceVideoUri` (the
Zoom/Teams one) and the user's own RSVP — with no diff in this repo at all.

The spread stays. MulmoClaude's handler is the same `{ ...event }`, and narrowing one host would
hand the same phone two different answers. What changes is that the key set is now written down
and asserted, so the next widening is a decision someone makes rather than a silent publication.
The assertions that were already there could not do it: they compare the handler's result
against the very object the stub returned, so they hold for any key set.

The calendar arm is pinned the same way. It spreads off a different upstream type and therefore
widens independently, so covering only the event arm would have left the identical silent
publication one handler away — the site fixed, the class open.

## What is left upstream — three things, none of them fixable here

A Codex cross-review round raised all three, and agreed on the remedy for each after being shown
why this repository cannot supply it.

**1. An unattended push deletes without leaving any record.** `propagateDeletes` is reachable
from the scheduled sync, not only from the button: `pullProtectionFor` calls `pushCollectionNow`
when a collection also sets `autoPush`, and that calls `sweepDeletes` with the flag. The engine's
`reportAutoPush` destructures neither delete count, and its only info branch is guarded on
`created + updated > 0` — so a run that ONLY deleted logs nothing at all, in any branch.

This host has no hook to close it. `SystemTaskDef.run` returns `void`, `googleCalendarSyncTaskDef`
takes only a root and an interval, and the alternative — dropping core's task and driving the
exported sync functions from here — re-implements something core owns and diverges from
MulmoClaude, which registers the same task def. The fix belongs in `reportAutoPush`. What this PR
does instead is log both counts on the manual route and say plainly, in the changelog, that
`propagateDeletes` with `autoPush` is unaudited.

**2. The plugin calls an applied deletion "not applied".** The renderer that distinguishes them
already exists in MulmoClaude's tree — `CollectionView.vue` picks `pushDoneWithDeletes` when
`deletedInGoogle > 0` — but it is not in a published release: the newest published
collection-plugin has no occurrence of that key. A host-side gate is not an alternative and would
be worse than none: the flag is a field of the user's own `schema.json` read inside core, and a
refusal at our route would cover the button while the scheduled path went on deleting.

**3. `@receptron/sharedapp` is outside its declared peer range.** It declares `^4.0.0` and now
runs on core 5. There is no newer release to move to. Beyond checking that its three imports
resolve, its one non-predicate import was exercised against core 5 at runtime: `parseAuthoredApp`
reads `manifest.ok`, `.kind` and `.detail`, core 5's failure type still carries them, and the
real outputs are correct — malformed JSON and a missing `aid` both produce their proper messages.
The drift is recorded in the guard rather than made red, because a red check with no available
remedy is one people learn to ignore; whether to ship on it is the human's call, not the guard's.

## Verification

- `yarn format` / `yarn lint` / `yarn typecheck` / `yarn build` / `yarn test`, then again from
  `rm -rf node_modules && yarn install --frozen-lockfile` — a lockfile change is only proved by
  a clean resolve, not by the warm tree that produced it.
- Every new guard mutated to confirm it fails: the dropped drift record, the renamed core symbol,
  the dropped body field (which lands on the key-set assertion, not on a fixture), and a
  simulated core widening of the event (which lands on the published key set).
- The app itself, on a scratch `HOME` with a seeded collection: the collection pane's table,
  calendar and kanban views; the push button, which reaches the route this change touches and
  reports our own not-linked wording; the accounting pane creating a ledger and routing on to
  opening balances. `scripts/ci-ws-smoke.mjs` for the PTY path.

### What was NOT exercised

The markdown, chart, html, mulmoscript, shapescript and form panes were not opened in a browser.
They render an agent's tool result, so reaching one needs a live agent session with a key, and
the Files pane is not a substitute — its Markdown preview is server-rendered HTML, not the
plugin. Each mounts through a per-view Shadow DOM with its stylesheet imported as a `?inline`
string, and markdown-plugin's lazy chunk set changed in this bump, so a style that stopped
matching under the shadow root would not show up in anything run here. An unresolvable lazy
import would fail the build, which passed; a mis-scoped stylesheet would not.

A non-zero `deletedInGoogle` was also not driven against Google: `propagateDeletes` was declared
on the seeded collection, but an actual deletion needs a linked account and a real calendar. That
path is covered only through the shaper and its specs.
