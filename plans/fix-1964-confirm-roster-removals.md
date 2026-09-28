# fix(sharedApp): name the people a publish would remove, and confirm before removing them (#1964)

## Problem

Publish replaces the live roster (`apps/{aid}.members`) with app.json's. Nothing compares the two,
so an app.json older than the live roster takes people off it silently, and the publish still
reports success. With two owners this needs nothing unusual: A invites someone, B publishes from B's
own copy of app.json, and the invite is gone.

## Decisions (agreed on the issue's open points)

- **Its own consent, `confirmRemovals`,** not `confirm`. `confirm` accepts live records that do not
  fit the schema, and agreeing to that must not be spent on somebody losing access. This has the
  same shape as the frozen-key refusal, which `confirm` also does not reach.
- **Both consents are asked at once.** When the records refusal and the roster refusal both apply,
  publish returns both lists together, rather than one per round trip.
- **Removals only.** A person removed loses access irreversibly. A role change keeps the address,
  so it is not counted. Stale role changes are a separate question.
- **Nothing extra for case or self-removal.** `rosterCaseProblems` already refuses non-lower-case
  keys, and `publisherProblems` already refuses a publisher removing themself.
- **Only with a live roster to compare.** `existingApp === null` is either a first publish or an app
  this account is not on, and neither overwrites a roster.
- **`check` names them too**, from the same `apps/{aid}` read it makes for the identity keys.

## Change

- `server/backends/sharedApp/rosterRemovals.ts` (pure):
  - `rosterRemovals(live, authoredMembers)`: live keys that app.json lacks, compared on own keys
    only, with their string roles.
  - `describeRoles`
  - `removalLines`
  - `removalRefusal(removals, confirmRemovals)`
- `publish.ts`: computes the removals from `existingApp` and passes the refusal into `publishGate`,
  which joins it with the records refusal. On success, `removedMembers` lists who was taken off.
- `context.ts`: `SharedAppOptions.confirmRemovals`.
- `declare.ts`: `CheckReport.removals`, from the same live read as `keys`.
- `shared-app-tool.ts`:
  - the `confirmRemovals` parameter and the tool description
  - `checkRemovalNote` and its headline in `check`
  - the removed addresses in the publish report
- The `mulmoterminal-shared-app` skill documents the refusal and the consent.

## Verification

- `rosterRemovals.spec.ts` covers:
  - removals named with their roles, sorted
  - nobody removed when app.json keeps or adds people
  - a role change not counted
  - no live app, a missing roster, and a non-map roster
  - own keys only (`constructor`)
  - non-string roles dropped
  - `confirmRemovals` must be exactly `true`
- `sharedApp.spec.ts` (fake Firestore):
  - a stale app.json is refused, naming the guest, with nothing written
  - `confirmRemovals` removes the guest and reports it
  - `confirm` does not override the refusal
  - records and roster refusals come back together
- `sharedAppCheck.spec.ts`: `check` names the late invite from the live roster, and nobody when
  signed out.
- `sharedAppTool.spec.ts`: `checkRemovalNote`.
- Removing the refusal from publish, loosening `=== true`, or blanking check's removals each turns
  its spec red.

Not run: a publish against real Firestore. The comparison is between two documents this code
already reads, and the fake store models `apps/{aid}` the way the existing publish specs rely on.
