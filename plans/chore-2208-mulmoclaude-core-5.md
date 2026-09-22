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

## What is left upstream

`propagateDeletes` now makes a push destructive, and two things downstream of us report it
wrongly. Neither is fixable here — both are the plugin's own rendering:

- the toast still says "N local deletions not applied" when they WERE applied;
- core merges a declined deletion into `skipped`, and the plugin turns any non-empty `skipped`
  into "Push failed" and returns, hiding the counts that did land.

The route now logs `localDeletes` and `deletedInGoogle`, so the irreversible half of a push
leaves a host-side record whatever the toast says.

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
