# fix: refresh the live reply from claude's transcript only for a claude session (#2124)

## Problem

`publishActivity` re-reads the reply (`refreshLastResponse` → `readLatestResponse`) when a turn ends
(`waiting`), and that read is always of CLAUDE's transcript
(`~/.claude/projects/<slug>/<id>.jsonl`), whatever agent the session runs.

#2124 filed this as unreachable on four grounds. Checked again on current `main`:

- ground 1, "codex never sets `waiting`": **no longer true**. codex now sets it
  (`codex-activity-track.ts`, through `boundaryOutcome` and its approval hook), so the read runs
  for codex sessions.
- ground 2, "a missing file writes nothing": still true, and it is the only thing left.
- grounds 3 and 4, "the client takes the reply from `GET /api/session/:id`": still true, but that
  route passes the live value through `sessionDetailView`, which **prefers the live value** over
  the per-agent read. So if ground 2 ever failed, a claude reply would **override** a codex reply,
  not merely go stale.

Nothing is wrong on screen today. The read is wasted work, and it is one broken assumption away
from a wrong reply.

## Fix

`shouldRefreshReply` (pure, `server/session/activity-transition.ts`) takes the session's `agent`
and answers true only for `"claude"`. `publishActivity` passes the pty entry's own `agent`. Every
claude entry records `agent: "claude"`, including custom agents and reattached sessions
(`spawn-claude.ts`), so claude sessions keep refreshing. Every other agent's reply keeps coming
from `sessionLastTurn` on the route, as before.

Not taken: routing this through `sessionLastTurn`. `publishActivity` is synchronous and that
reader is async, the same reason #2122 left it.

## Verification

- `activity-transition.spec.ts`: true for claude. False for every other `SESSION_AGENTS` value
  and for an unknown agent, derived from the list so a new agent is covered automatically.
- `lifecycle.spec.ts`: a codex session's turn end does not touch `lastResponses`, and a claude
  session's still refreshes.
- Removing the claude condition from the rule, or passing a constant `"claude"` from
  `publishActivity`, turns these red.
