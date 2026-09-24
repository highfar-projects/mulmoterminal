# fix: a resumed issue session opens as its own agent, not as Claude (#2227)

## Problem

Starting work on an issue whose worktree already holds an unattached session resumes that session
(`outcome: "resumed"`). The session can be any agent — `DirSession` carries `agent` — but the
`/api/issues/start` reply names none, and `useIssueStart.ts` places every result as `agent:
"claude"`. The cell then connects on Claude's endpoint: a live pty is reattached by id (so it
happens to work), but anything else goes to `spawnClaudePty`, and the grid persists the cell as
`claude`.

## Change

- `StartIssueWorkDeps.spawnDraft` returns `{ sessionId, agent }` — the spawner says which agent it
  started, rather than `issue-work.ts` assuming one. Both callers (desktop route, phone handler)
  spawn Claude today and say so.
- `StartedResult` gains `agent`, set wherever `sessionId` is: the spawner's answer for
  `created` / `reused`, the occupying session's own `agent` for `resumed`.
- The desktop route passes it through as-is (it already returns the whole result).
- `useIssueStart.ts` places the cell with `asTerminalAgent(data.agent)`: an absent or unknown value
  reads as `claude`, which is what the reply meant before this field existed.

## Out of scope

- Choosing the agent to start with (#2228, #2226).
- The phone reply: the phone places no cell, so nothing there reads an agent yet.

## Tests

- `issue-work.spec.ts`: `resumed` carries the occupant's agent (a codex occupant comes back as
  codex); `created` / `reused` carry the spawner's.
- `issueStartOutcome.spec.ts`: the cell is placed with the reply's agent; an absent or unknown one
  places as `claude`.
