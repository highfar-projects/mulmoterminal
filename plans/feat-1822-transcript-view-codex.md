# feat: the phone's conversation view reads codex too, and says when it cannot read at all

Issue: [#1822](https://github.com/receptron/mulmoterminal/issues/1822) — the decision issue. This is
the FIRST of its per-agent implementations, and it is the one that carries the skeleton.

## What the decision turned out to rest on

#1822 was written at `a71872a1` and asked which of codex / antigravity / grok / muse to support.
Two things have changed since, and both move the answer:

1. **There are seven agents now**, not five — copilot (#2063) and cursor (#2065) arrived after it was
   written, and #2066 / #2072 built cursor's transcript locator and record parser along the way.
2. **The deciding question is not implementation cost but whether the record shapes can be
   MEASURED.** This repo decides a fold by reading real records (#1822's own "レコード → 行はエージェ
   ントごとに測り直し"). Writing a fold against a shape nobody has seen is how a reader ships that
   silently produces nothing.

Measured on this machine:

| agent | data here | verdict |
|---|---|---|
| claude | 11,601 transcripts | already read |
| **codex** | **6,901 rollouts** | this PR |
| cursor | 35 transcripts | next (locator and parser already exist) |
| copilot | sqlite, `turns` table, 8 rows | next — one row per turn, prompt and reply already split |
| grok | `~/.grok` holds **no files at all** | cannot be measured here |
| muse | `session-index.db` **absent** | cannot be measured here |
| antigravity | **no home directory** | cannot be measured here |

The last three are "not measurable", not "not possible". They land on this PR's skeleton the day a
real session exists to measure.

## The skeleton, and the one rule it must not break

**The agent is never asked which reader answers.** A claude session that outlived a server restart
reports its agent as `shell` (a claude pane's `pane_current_command` is a version string), so a
reader chosen by `agentOfSession` loses the view on exactly those cells — the regression the original
file's comment was written to prevent. Each source is asked whether IT has a file for this
(cwd, id), in order, first hit answers. File existence is a fact; the agent is a guess.

`TranscriptSource` is `{ agent, locate, createFold }`. `createFold` is a factory rather than a
function because codex's fold needs state across records (below).

## `not-supported`, and what it is NOT

A fifth status. It means **this session's agent keeps a conversation and no reader here reads it
yet** — a sentence, and a thing to implement. It is answered only after every source has missed,
which is the one moment the agent can safely be asked.

A **shell** cell never gets it: a shell has no conversation and never will, so the screen is its
content rather than a fallback from something missing. Saying "not supported" there would name a
feature that is not coming.

The phone needs no lockstep: `parseTranscriptView` keeps a closed list and falls back to `none` for
anything else (`mulmoserver/src/firestore/transcriptView.ts:115-119`), so the view degrades exactly
as it does today until the phone has a sentence for it.

## Codex's fold — three traps, all measured

Against the 6,901 rollouts here and one sampled whole (215 records):

1. **A `role: "user"` message is usually NOT the person.** Both of the sampled rollout's are codex's
   own preamble (`<recommended_plugins>`, `<environment_context>`). The boundary is `codexUserTurn`,
   already measured over all 6,334 rollouts and already serving three readers. A fresh "has a user
   message" predicate fuses every exchange into one turn the line budget can never evict.
2. **One prompt can be written TWICE** — a `response_item` immediately followed by an `event_msg`
   with identical text (924 pairs in the store). `isDoubleWrite` drops the second; without it every
   prompt shows twice with an empty turn between.
3. **`reasoning` carries nothing readable** (`summary: []`, encrypted body) — the same treatment
   claude's `thinking` gets, for the same measured reason.

Tool calls show name + the head of the arguments; tool results go through claude's own
`toolResultRow`, so one result is not six lines for one agent and whole for another.

## Behaviour preservation, proved rather than argued

Extracting `foldTurnRecord` out of `foldTranscriptView` is a claim that claude's view is unchanged.
A differential harness ran the OLD function beside the new one over **400 real claude transcripts and
4,000 generated sequences — 167,148 records, 0 mismatches.**

The harness could not survive (half of it was the code it replaced), so the two things that outlive
it were harvested into `transcript-view-codex.spec.ts`: the **generator** (which record shapes
matter, including the malformed ones) and the **property** — claude's fold equals the shared fold
plus claude's three renderers, checked over 2,000 generated sequences on every run.

## Mutation-verified

| mutation | what went red |
|---|---|
| the agent chooses the reader | 2 — including the restarted-claude regression |
| `shell` is told "not supported" | 1 |
| a source's miss ends the search | 3 |

The file was compared against a pristine copy before each mutation and restored after.

## Not in this PR

Cursor and copilot — each is its own PR on this skeleton, as #1822 asks. The phone's sentence for
`not-supported` is a mulmoserver change and is not needed for the host to answer it.
