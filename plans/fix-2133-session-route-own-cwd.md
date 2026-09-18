# fix: a route about one SESSION answers about that session's directory (#2133)

## The defect, established

`?cwd=` is optional on every route that takes it, and the default has always been the workspace
(`CLAUDE_CWD`). That is right for a route reporting on a DIRECTORY — the grid's resume picker, the
scripts list, git status — and wrong for every route reporting on a SESSION, because a session runs
where it runs and most of the stores these routes read are partitioned by directory: claude's
transcript sits under a slug derived from the cwd, and grok's, cursor's, copilot's and muse's are
scoped by it too.

The caller that does exactly that is the collection chat pane. `useSessionSummary.ts` knows the
session and its agent and has no directory to send — a chat is filed under a COLLECTION, not under a
path — so it asks `GET /api/session/:id?agent=…` with no `cwd`, and its supervision line was read
out of a different project's files.

Measured on this machine's real stores, driving the real route both ways for the same session, before
any change:

```
claude session (this repo)
  WITH cwd    -> cwd=~/ss/llm/mulmoterminal4   lastPrompt="すすめる"
  WITHOUT cwd -> cwd=~/mulmoclaude             lastPrompt=null

grok session (its store is partitioned BY DIRECTORY)
  WITH cwd    -> cwd=~/ss/llm/mulmoterminal4   agentTitle="こんにちは"
  WITHOUT cwd -> cwd=~/mulmoclaude             agentTitle=null
```

## The rule, and where it is decided

**A route that is ABOUT one session answers about THAT SESSION's directory when the request names
none. A route that is about a DIRECTORY keeps the workspace.**

It is decided in one place, `workspaceForRoute` in `server/routes/routeParams.ts`, which already
distinguishes the two cases `workspaceRequest` returns. A session-scoped route now hands over the
session's own directory as the default to use instead of the workspace; a directory-scoped route
hands over nothing and is unchanged.

Only the ABSENT case moves. An explicit `?cwd=` still wins, including one that disagrees with where
the session runs — #1151's rule (never answer about a different directory under the requested one's
name) holds here too — and an unusable `?cwd=` is still refused rather than rescued.

**Not fixed in the caller.** Adding a `cwd` to `SpawnedChatRequest` would fix this one caller and
leave the next to rediscover it, and the server knows the answer better than the client does:
`cwdForSession` resolves live PTY → remembered → workspace, and exists because "a cell relaunched
somewhere else keeps its id but not its directory".

The five session-scoped routes: `/api/session/:id`, `/api/transcript/timeline`,
`/api/transcript/prompts`, `/api/transcript/last-turn`, `/api/transcript/view`. All five are swept
together and each is pinned separately — #2121 fixed one of three sites reading the wrong file and
left the other two, and a defect in a shared decision comes back through whichever caller was missed.

## Reach, measured

`cwdForSession` answers for a session this server SPAWNED — live from `ptys`, or remembered across
restarts from `~/.mulmoterminal/dev-terminal-cwds.json`. A session it has never seen still falls back
to the workspace, exactly as before: no regression, and no improvement either. That covers the
reported case completely, because the pane only lists chats MulmoTerminal itself spawned.

Driving the route again after the change, for three agents whose sessions this machine's log
remembers: claude, codex and Antigravity each answer identically with and without `cwd`, and each
names its own directory rather than the workspace.

What changes per agent is not uniform, and the split is worth recording:

- **claude, grok, cursor, copilot, muse** — read from a directory-partitioned store, so the CONTENT
  changes: blank becomes correct. Demonstrated end to end for claude; the other four have no session
  on this machine that MulmoTerminal spawned, so they were not exercised.
- **codex and Antigravity** — resolve through our own id → conversation log and never consult the
  cwd, so their text was already right and only the reported `cwd` field becomes truthful. That
  id-keyed resolution is what saves them, and it is exactly what #2132 is about.

`cwdForSessionHydrated` awaits the remembered map's hydration before reading it, as every other
reader of that map does (`ws-routes`, `surviving-sessions`). Without it a poll landing inside the
boot-time file read is told the workspace — the very default this replaces.

## Verification

- **The decision**, through a probe route so a refusal is observable: own directory used when none
  was named; workspace kept when no session directory is offered; an explicit `?cwd=` wins; an
  unusable `?cwd=` is still a 400/404 refusal rather than a fallback.
- **The five routes**, against a fixture where the SAME session id has a transcript under both the
  session's directory and the workspace, with different words in each. The decoy is what makes it a
  measurement: a workspace holding nothing could not tell "read the right file" from "read no file".
- **A list route** still answers about the workspace with no `cwd`.
- **The hydration await** — see the section below for why its test sits where it does.
- Break-verified by mutation: ignoring the session's directory, letting it override an explicit
  `?cwd=`, letting it rescue an unusable one, and dropping it from each of the five routes in turn —
  every mutation goes red, and the tree was compared against a pristine copy before and after each.
  Dropping the hydration await is mutated separately, against the spec that can see it.

## The hydration await, and where the test for it had to go

`cwdForSessionHydrated` waits for the remembered directories to be read off disk before reading
them. It is pinned by `test/server/session/session-cwd-hydration.spec.ts`, and getting there took
a wrong turn worth recording, because the shape that fails is the obvious one.

Mutating the await against the ROUTE spec leaves everything green, every time: by the time a route
call happens the file read has long since completed, so the await makes no difference to what the
route answers. That is a real property of the code, and it is what makes the guard look untestable.

What is testable is the tick the import returns on. Filling the map needs a COMPLETED file read —
a macrotask — and only microtasks run between a module finishing evaluation and its importer
resuming, so at module scope the map is deterministically still empty. The spec captures both
values there: `cwdForSession` before anything awaits, and `cwdForSessionHydrated` after. The first
is the premise, asserted rather than assumed, because without it the second could be green for
either reason.

Module scope is kept because it is the only placement with a reason behind it, not because the
alternative fails. Measured on both sides — mine and the reviewer's, which tried three variants —
the spec goes red with the await removed from module scope **and** with either capture moved into
a test body. That placement happens to work; nothing guarantees it, since a test body runs an
unknown number of macrotasks after the import. The route-level spec is where the same race is
already lost.

This paragraph first said the opposite: that an in-`it` capture would pass and so quietly empty the
file. That was reasoned rather than run, and running it took one command and returned the other
answer. It is recorded because the failure mode is the point — a headnote asserting a false
measurement is worse than one asserting nothing.

## Deliberately left out

- **`/api/cost`** takes a `?session=` but its primary answer is a directory roll-up, so it stays
  workspace-scoped: redirecting it would change what the roll-up is about. Its only caller sends the
  cwd.
- **#2132** — the eight readers that resolve a mapped conversation without using the recorded cwd.
  This change makes the directory available to them; whether they should USE it is that issue's
  design question, and the answer here (a session is answered about its own directory) is input to
  it rather than a decision on it.
