# fix: release the all-tools claim when a fresh spawn throws (#2848)

## Problem

claude, codex and copilot record the full-GUI-MCP ("all tools") claim through `claimFullGuiMcp()`
before the pty starts. A spawn that throws (no tmux, no agent binary) left the claim behind:
`hasAllGuiTools(id)` stayed true and `all-tools-sessions.json` kept the `true` line.

## Decision

Release on failure, fresh spawns only. The claim stays before the spawn: #1338 needs a group url
that connects first to already know to stand down. A tmux reattach made no claim of its own (the
surviving process still runs with the url it was given), so its record is left alone.

## Shape

- `server/session/failed-spawn-claim.ts` — `releasesClaimAfterFailedSpawn({ carriesFullGuiMcp, wouldReattach })`,
  pure: release only what this spawn recorded (`carriesFullGuiMcp && !wouldReattach`).
- `server/session/spawn-with-full-gui-claim.ts` — `spawnWithFullGuiClaim(request, spawn)`: claims,
  runs the spawn with the answer, releases on a throw when the decision says so, rethrows unchanged.
- The three spawners route claim-through-spawn through that helper. claude keeps its single reattach
  probe (shared with the tool-group reset) and its `withSettingsCleanup` around the whole spawn;
  copilot keeps `withSettingsCleanup` around `startAgentPty`.

## Verification

- `test/server/session/failed-spawn-claim.spec.ts` — each spawner, real registry under a temp HOME:
  fresh spawn throws releases; reattach throws keeps; successful spawn keeps. Red on origin/main.
- `test/server/session/releases-claim-after-failed-spawn.spec.ts` — the decision over every input,
  and the helper's order / rethrow behaviour.
- A throwaway old-vs-new harness compared the success path of all three spawners over generated
  inputs (ordered claim, reset, probe, pty spawn, registration, cleanup wrapper calls).
