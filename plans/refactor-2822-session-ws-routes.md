# refactor: session/ws route clones (#2822)

The last cluster of #2822's jscpd alerts: three clones inside `server/routes/session-routes.ts` and
`server/routes/ws-routes.ts`. All three are removed; none is declined.

## What is extracted

1. **`sessionRouteTarget(req, res)`** (session-routes.ts) — validate `?session=`, then resolve the
   directory through `workspaceForRoute` with the session's own remembered cwd. Returns
   `{ session, cwd }` or null once the 400 / workspace refusal has been sent. Used by the four
   `?session=` transcript routes: timeline, prompts, view, last-turn. last-turn computed
   `normalizeAgent` between the two steps; it is pure, so it now runs after them.
2. **`ownIdSessionList(route, listRows)`** (session-routes.ts) — the copilot and cursor listings, the
   two agents whose session id is ours, so there is no conversation map to join. The wrapper keeps
   the order the originals had: workspace check, then `survivorSnapshot()`, then the list, then
   `withAttached(rows, [], running)`. A failed read still logs `[api] <route> failed:` and answers
   500. grok also joins against `[]`, but it takes its snapshot after the list, so it is left alone.
3. **`admitInSessionDir(ws, kind, …)`** (ws-routes.ts) — the copilot/cursor admission: live entry,
   then the session directory (`live.cwd ?? sessionCwd ?? request cwd`), then the worktree
   reservation, then `admitAgentSession`, all against that one directory. It is called inside
   `sessionConnects`, as the inlined code was.

## Why it behaves the same

The old files were copied verbatim next to the new ones, and throwaway vitest harnesses ran both
over seeded generated inputs, comparing whole results:

- session routes: both mounted on real `app.listen(0, "127.0.0.1")` listeners under a scratch HOME,
  with the readers mocked to echo their arguments; status, content type, body, the order of reader
  and snapshot calls, and `console.error` all compared.
- ws routes: `handleCopilotConnection` / `handleCursorConnection` with generated live/remembered/
  requested/gui/foreign-survivor/worktree-occupancy states; every effect (reservation, admission
  marks, spawn/reattach arguments, socket sends and closes, logs) compared.

A deliberate mutation of each new helper made its harness fail. The property that outlives the
harness is in `test/server/routes/session-route-refusals.spec.ts`: refusals answer without
reading, the snapshot comes before the list, and a failed read answers 500 naming the route. The
spec passes against the old file as well.
