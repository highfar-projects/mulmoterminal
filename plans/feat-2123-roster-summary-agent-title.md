# feat: a summary line for the agents whose store already has one (#2123)

## The gap

The cockpit roster shows three lines per cell — `summary` / `prompt` / `reply`. #2122 filled the
last two in for every agent this host can read. **`summary` is still blank for everything but
claude**, which #2121 asked for and #2122 deliberately did not deliver.

`summary` is `aiTitle`, and on the default title source that is the `ai-title` record **Claude Code
writes into its own transcript**. Nothing else writes an equivalent, so there is no value to fetch;
one has to come from somewhere.

## Why the opening prompt is the right value, not a lesser one

The objection when this was filed was that an agent's opening prompt is *a different kind of value
wearing the same label* — claude's row would be an AI summary of where the session got to, another
agent's would be where it started.

That objection does not survive reading `header-title.ts`: **Claude's own title is written once and
never changes** ("72 of 72 sessions measured"). On the default source, claude's `summary` is already
"what this session was about near its beginning". That is exactly what an opening prompt is, so the
two agree in meaning and the same label is honest.

The alternative — generating a real summary with the (now hardened) headless summarizer — stays
available and is not foreclosed by this. It costs a `claude -p` per few turns per watched cell and
requires the claude CLI, so it is not the thing to make the default experience depend on.

## Where the value comes from

**Every agent's history list already derives exactly this.** The roster does not need a new idea,
it needs a per-id version of a read each agent's listing already does:

| agent | what its own store calls a session | per-id cost |
|---|---|---|
| codex | first user prompt from the rollout head | `codexRolloutPath` (memoized since #2122) + a bounded head read |
| cursor | first user message in the transcript | `cursorTranscriptPath` + a 4 KB head read |
| copilot | **copilot's own `summary` column** | one indexed sqlite query, in-process |
| grok / muse / antigravity | first prompt / muse's `title` column / first user turn | needs work per agent — not in this change |

So the scope is **codex, cursor and copilot**: the non-claude agents whose own store answers this
cheaply for one id. That is the same set `hasReader` names, which is not a coincidence worth
relying on but does mean the roster's three lines now fill in *together* for a given cell rather
than partially — an agent either contributes these rows or it does not.

## The shape

- `server/agents/agent-session-title.ts` — one agent-branched reader, the same shape as
  `agent-badges.ts` next to it. A fourth agent is one function and one row in a spec.
- The route answers it as **`agentTitle`**, a field of its own rather than by writing into
  `aiTitle`. `aiTitle` is the value MulmoTerminal manages in memory and carries the `/clear`
  sentinel; the agent's own store label is neither, and conflating them would drag clear semantics
  onto agents that have no `/clear`.
- The client renders `summary` as `aiTitle ?? agentTitle`, so claude is untouched.

**Caching.** codex's and cursor's values are written once and never change, so they are remembered
like the rollout path, and a MISS is never remembered — a cell whose agent has not written its
first turn yet must not read as blank until the process restarts. copilot's `summary` is its own
and CAN change, so it is not cached; the query is indexed and in-process.

## Verification

- Per-reader specs over real on-disk layouts in a temp HOME, plus the route.
- Checked against the real stores on this machine, not only fixtures — the same way #2122 was.
- The claude path must be provably untouched: `agentTitle` is null for claude and `summary` still
  comes from `aiTitle`.
