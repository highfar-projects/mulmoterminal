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
  names core too, at a peer range the new core did not satisfy — it was the one package this
  upgrade put out of range, and nothing reported it. The guard now reads every direct dependency
  that names core, and the drift was RECORDED so both directions fail: a new one has to be judged,
  and a fixed one has to lose its entry. **The second direction has now fired for real** — 0.36.0
  declares `^5.4.0`, the drift disappeared, and the guard went red until its record was emptied.
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

## Two of the three upstream problems have shipped fixes

A Codex cross-review round raised three things this repository could not fix. Moving to core
5.4.0, collection-plugin 5.2.0 and `@receptron/sharedapp` 0.36.0 closes two of them.

**FIXED — the plugin called an applied deletion "not applied".** collection-plugin 5.2.0 selects
`pushDoneWithDeletes` when `deletedInGoogle > 0`, in every shipped locale, and derives the
not-applied number as `localDeletes - deletedInGoogle`.

That subtraction is why the two halves belong together: **the field this PR stopped dropping is
what makes 5.2.0's fix work here.** Without `deletedInGoogle` on the wire the plugin reads it as
zero, and every deletion — including the ones that really carried — is reported as not applied,
which is the defect 5.2.0 exists to fix.

**FIXED — `@receptron/sharedapp` ran outside its declared peer range.** 0.36.0 declares
`^5.4.0`, which the pinned core satisfies. The guard's drift record is empty again, and it went
red on the way there: emptying it was forced by the test, not remembered.

**STILL OPEN — an unattended push deletes without leaving any record.** `propagateDeletes` is
reachable from the scheduled sync, not only from the button: `pullProtectionFor` calls
`pushCollectionNow` when a collection also sets `autoPush`, and that calls `sweepDeletes` with
the flag. `reportAutoPush` destructures neither delete count, and its only info branch is guarded
on `created + updated > 0` — so a run that ONLY deleted logs nothing at all, in any branch.
**Checked again against core 5.4.0: unchanged.** Filed as mulmoclaude#3262.

This host has no hook to close it. `SystemTaskDef.run` returns `void`, `googleCalendarSyncTaskDef`
takes only a root and an interval, and the alternative — dropping core's task and driving the
exported sync functions from here — re-implements something core owns and diverges from
MulmoClaude, which registers the same task def.

**STILL OPEN — a declined deletion reads as a failed push.** 5.2.0 fixed the wording and not
this: `pushProblems` is still `[...errors, ...skipped]`, core still merges the delete sweep's
refusals into `skipped`, and `reportPush` still returns early on a non-empty list. So a push that
created ten events and had one deletion declined shows only "Push failed", hiding the ten. Filed
as mulmoclaude#3272.

**This PR is what makes that reachable, and the early return was not wrong before it.** While
`skipped` held only records that could not be pushed, "this click did not do what you asked" was
the correct reading. A declined deletion is the first entry for which it is not — the push
succeeded and the deletion was deliberately not carried out. The host cannot split them: the
outcome carries only the merged `skipped`, `DeleteSweep` never reaches it, and recovering the
distinction would mean matching core's message text AND adding a field MulmoClaude's body does
not have. Codex agreed on both points in round 3.

## What core 5.4.0's own fix cost this repository

core made `collection/server` stop requiring the optional `firebase` peer by moving `Timestamp`
CONSTRUCTION out of its store and onto the `FirestoreDocs` seam — which gained a required
`timestamp(seconds, nanoseconds)` member.

No production code IMPLEMENTS that seam here — this host gets it from core's own
`createFirestoreDocs` — so nothing outside `test/` failed to compile. But production does READ
what the seam produces: `sharedApp/preview.ts`'s `orderKey` duck-types a stored instant as
`{ seconds, nanoseconds }` to sort a preview the way the query would. That is unaffected because
the SHAPE did not change — only who constructs it moved — and it is worth saying, because a
reader who believed no production code cared about the shape could change the stand-in below and
break the sort with every type still green.

The stand-in is what the in-memory fakes now share (`test/support/serverTimestamp.ts`) rather
than repeating the member ten times. Its shape is not a guess: core recognises a stored instant
by integer `seconds`/`nanoseconds`, `sharedAppPreview.spec.ts` was already asserting on exactly
those literals before this change, and the stand-in was run through
`decodeRecordTimes`/`encodeRecordTimes` to confirm it decodes to a canonical instant and encodes
back byte-identical.

## Verification

- `yarn format` / `yarn lint` / `yarn typecheck` / `yarn build` / `yarn test`, then again from
  `rm -rf node_modules && yarn install --frozen-lockfile` — a lockfile change is only proved by
  a clean resolve, not by the warm tree that produced it.
- Every guard mutated to confirm it fails: the dropped drift record, the renamed core symbol, the
  dropped body field (which lands on the key-set assertion, not on a fixture), and a simulated
  core widening of the event (which lands on the published key set). The drift guard also failed
  for REAL on the way to 0.36.0, which is the direction a mutation cannot stage.
- The fake `timestamp` seam run through core's own codec: it decodes to a canonical instant and
  encodes back identically, so the stand-in behaves like the SDK value rather than merely
  satisfying the interface.
- The app itself, on a scratch `HOME` with a seeded collection: the collection pane's table,
  calendar and kanban views; the push button, which reaches the route this change touches and
  reports our own not-linked wording; the accounting pane creating a ledger and routing on to
  opening balances. `scripts/ci-ws-smoke.mjs` for the PTY path.

### Failures that were the machine, not the change

The full suite on the clean install reported failures that the warm run on identical code did
not, and a second full run reported a DIFFERENT set — under a load average in the teens with
several suites in flight. Every one was re-run standalone and passed:
`eslint-template-assertions`, `eslint-void-use`, `collectionScopeIsolation`, `cwd-preset-routes`,
`cwd-presets-notify`, `copilot-resume-cwd`. Named here because "it was flaky" is not a result
someone else can check.

### What was NOT exercised

The markdown, chart, html, mulmoscript, shapescript and form panes were not opened in a browser.
They render an agent's tool result, so reaching one needs a live agent session with a key, and
the Files pane is not a substitute — its Markdown preview is server-rendered HTML, not the
plugin. Each mounts through a per-view Shadow DOM with a `?inline` stylesheet, so a style that
stopped matching under the shadow root would not show up in anything run here.

A non-zero `deletedInGoogle` was also not driven against Google: `propagateDeletes` was declared
on the seeded collection, but an actual deletion needs a linked account and a real calendar. The
collection pane was last driven against collection-plugin 5.1.0; 5.2.0's changed renderer has
not been opened in a browser.
