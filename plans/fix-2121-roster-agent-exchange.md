# fix: the cockpit roster's prompt / reply lines for a non-claude cell (#2121)

## The defect, established

`GET /api/session/:id` takes `?agent=`, and until now that param decided ONE thing: where the two
header badges are read from (#1465). Everything else on the route came out of `readSessionSummary`,
which opens claude's per-project transcript and nothing else. A codex cell has no file there — codex
mints its own id and writes `$CODEX_HOME/sessions/**/rollout-*-<id>.jsonl` — so the route answered
`EMPTY_SUMMARY`, and the cockpit roster's three lines (`summary` / `prompt` / `reply`) were blank
for every codex cell while the claude cell beside it was filled.

Measured against this machine's real store rather than read off the code: for six recent rollouts,
`readSessionSummary(cwd, id)` returned the empty summary for all six and the claude transcript the
route was opening existed for none of them, while the reader this repo ALREADY has
(`lastTurnFromCodexRolloutDocs`, used by `/api/transcript/last-turn`, the history list and the
prompt-history pane) returned a real prompt and a real reply for four of them. The two that came
back empty were rollouts with no completed turn — the honest answer for a session that has not
finished one.

The second half of the defect is on the client: the roster's own fetch (`seedMeta` in `GridView.vue`)
sends no `?agent=` at all, so even a fixed route would keep answering as claude for it. `TerminalCell`
has sent it since #1465; the roster and the collection pane's one-session reader never did.

## The rule, and where else it is decided

The rule is the one the badges already follow: **a field read from a session's conversation is read
from THAT AGENT's log.** Three call sites decide it and two had it wrong.

- `server/routes/session-routes.ts` — the route. Fixed by branching the exchange on `agent`, through
  `sessionLastTurn`, which is already agent-branched (codex + cursor today, `EMPTY_TURN` for the
  agents whose logs have no reader yet). A seventh agent gains the roster lines by teaching that one
  function, not this route.
- `src/components/GridView.vue` — the roster's poll. Sends the cell's agent now.
- `src/composables/useSessionSummary.ts` + `CollectionChatPane.vue` — the same three fields for one
  session, in the collection pane's tab chrome. A collection chat carries its agent
  (`SpawnedChatRequest.agent`) and can be a codex chat, so it had the same defect.

## What the review loop added

Two more changes came out of the cross-review, and neither is about which log is read — both are
about what the route does *per poll*, which is what sending `?agent=` from the roster made matter.

- **The codex rollout path is resolved once and remembered.** `agentBadges` and `sessionLastTurn`
  each call `codexRolloutPath`, which walks every day directory under `$CODEX_HOME/sessions` with a
  synchronous `readdirSync` — so a codex cell resolved its rollout twice on every poll, and this PR
  is what introduced that: before it the roster sent no `?agent=` and did none of these scans.
  Measured before the fix was chosen rather than after (the bench is in the PR thread), the walk is
  the dominant cost and it repeats for the same id for as long as the cell lives, which is why the
  memo is process-level rather than the request-local reuse the finding proposed. A hit is
  re-checked with one `existsSync` because codex prunes; a MISS is never remembered, because a cell
  whose rollout codex has not written yet must not read as absent until the process restarts; and
  the map is capped, because nothing prunes it.

- **Claude's transcript is read only for claude.** The first commit fixed the exchange and left two
  other readers of the same file untouched: `workPhase`, and the turn count and `ai-title` handed to
  `freshenRosterTitle`. On a fixture where a claude transcript sits at the same id, a grok session
  came back wearing claude's work phase and handed the title manager claude's own title — which is
  published onto the roster row. The collision itself is unlikely, so this is a correctness-of-rule
  and a cost fix rather than a live bug; it also removes a stat and a fold per poll for every
  non-claude cell.

## Deliberately left out

- **The `summary` line stays empty for codex.** It is claude's `ai-title`, which Claude Code writes
  into its own transcript; codex writes no equivalent anywhere, so there is nothing to read. Filling
  it would mean generating a title (the `headless` source, which is off by default even for claude)
  or promoting codex's first user prompt — a different value wearing the same label. Either is a
  feature, not this fix.
- **`publishActivity`'s `refreshLastResponse`** (`server/session/lifecycle.ts`) reads claude's
  transcript whatever the agent, so the pub/sub row carries no reply for a codex session. The roster
  does not read its prompt/reply from that channel (GridView's own comment says the route is the
  single source of truth for these three), so it is not what #2121 reports — but it is the same
  blindness one layer over, and it is synchronous where the agent-branched read is not. Follow-up.
- Anything about the badges, which #1465 already fixed.

## Verification

- A route-level spec: a codex rollout on disk, no claude transcript for the id, `?agent=codex`
  answers the rollout's prompt and reply; `?agent=claude` on the same id still answers claude's
  transcript; the roster's old no-param request is unchanged.
- The client specs pin that the agent reaches the query string.
- The memo has its own spec pinning the three properties that are not obvious from it working: a
  miss is never remembered, a pruned rollout stops resolving, and the map stays bounded. All three
  were break-verified by mutation.
