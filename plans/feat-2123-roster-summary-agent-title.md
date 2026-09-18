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
| antigravity | the first user turn, unwrapped from agy's `<USER_REQUEST>` block | a plain path join — **no scan at all**, the cheapest of the four |
| copilot | **copilot's own `summary` column** | one indexed sqlite query, in-process |
| grok | first prompt for this id in the cwd's `prompt_history.jsonl` | one bounded tail read per directory |
| muse | muse's OWN `title` column | one indexed sqlite query, in-process |

So the scope is **every agent MulmoTerminal hosts**.

**A correction worth recording, because it was made twice.** The first version of this plan said
grok, muse and antigravity would each "need work per agent" and left all three out. That was wrong
about all three: agy's transcript path is a plain join with no scan (cheaper than codex), muse's
index answers by session id exactly as copilot's does, and grok's prompt history is one bounded
tail read. Each took minutes once actually read. **The cost was asserted from memory and the
estimate decided the scope** — which is the failure, not the number.

The two that answer from their own SUMMARY rather than the person's opening words — copilot and
muse — are also the two that are not cached, because both rewrite it as the session goes. That the
split falls the same way twice is a property of the stores, not a rule imposed here.

## The shape

- `server/agents/agent-session-title.ts` — one agent-branched reader, the same shape as
  `agent-badges.ts` next to it. A fourth agent is one function and one row in a spec.
- The route answers it as **`agentTitle`**, a field of its own rather than by writing into
  `aiTitle`. `aiTitle` is the value MulmoTerminal manages in memory and carries the `/clear`
  sentinel; the agent's own store label is neither, and conflating them would drag clear semantics
  onto agents that have no `/clear`.
- The client renders `summary` as `aiTitle ?? agentTitle`, so claude is untouched.

**Caching, as the review loop left it.** Four readers remember, two do not, and the reasons are not
all the same — which is the part the first version of this paragraph got wrong:

- **codex, cursor, agy** answer from a record written ONCE, so the value cannot go stale, only
  absent — and absent is already answered as null by the readers themselves.
- **grok is remembered for the opposite reason.** `grokPromptTitles` reads a 256 KB TAIL, so "the
  first prompt for this id" is the earliest *surviving* line in that window, and it drifts later as
  a directory's history grows. Caching is what keeps the roster's summary still: it pins the
  earliest reading we got, which is also the closest to the true first. The bound on being wrong is
  that a session first seen after its opening had aged out would have read the later prompt anyway.
- **copilot and muse are not cached at all**, because both rewrite their own summary as the
  conversation goes.
- **A MISS is never remembered**, for all four — a cell whose agent has not written its first turn
  must not read as blank until the process restarts.
- **The key is the RESOLVED conversation, never our session id.** codex and agy file under an id of
  their own and MulmoTerminal maps ours onto it; that map moves when a cell is relaunched or resumed,
  so a cache keyed by our id keeps answering with the conversation the key used to name. The
  resolution therefore happens above the cache.

The last two points are the loop's, not the original design's, and both were live defects.

## Verification

- Per-reader specs over real on-disk layouts in a temp HOME, plus the route.
- Checked against the real stores on this machine, not only fixtures — the same way #2122 was.
- The claude path must be provably untouched: `agentTitle` is null for claude and `summary` still
  comes from `aiTitle`.
