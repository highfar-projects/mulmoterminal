# fix: the account mark survives a same-process reattach (#2948)

## Problem

The `credential` frame that fills a cell's account mark (#2919) was sent only from `spawnClaudePty`.
A reload, or a cell remounting onto a session still alive in this server process, goes through
`reattachPty` and never reaches the spawner, so the mark stays blank.

## Change

- `server/session/credential-frame.ts`: the frame as a pure function of the rotation config and the
  session's token.
- `server/session/credential-announce.ts`: sends it; moved out of `spawn-claude.ts` so the spawner and
  the route share one implementation.
- `ws-routes.ts` `handleClaudeConnection`: announce on the reattach branch.

## Out of scope

Switching a running session to another token from the mark (separate issue and PR). Other agents'
endpoints: rotation applies to plain claude cells only.

## Verification

Specs for the frame rule and for the route (reattach announces, spawn leaves it to the spawner).
Not exercised in a browser against a real rotated session.
