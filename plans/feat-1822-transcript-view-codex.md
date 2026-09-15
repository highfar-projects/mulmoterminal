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
| **codex** | **6,905 rollouts** | this PR |
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

## Codex's fold — four traps, all measured

The first two came from sampling one rollout whole (215 records). **The last two only from counting
the store**, and they are the ones a single sample cannot produce — round 1 of the cross-review
found the third, and the fourth was invisible until the third was fixed.

Measured over **500 randomly sampled rollouts** of the 6,905 here, `response_item` payload types
with the number of those files each appears in:

| payload.type | records | files |
|---|---|---|
| `function_call` / `_output` | 7,900 each | 286 |
| `reasoning` | 6,172 | 489 |
| `message` | 5,205 | 500 |
| `custom_tool_call` / `_output` | 2,898 each | **260 — 52% of rollouts** |
| `web_search_call` | 15 | 10 |
| `tool_search_call` / `_output` | 3 each | 3 |

1. **A `role: "user"` message is usually NOT the person.** Both of the sampled rollout's are codex's
   own preamble (`<recommended_plugins>`, `<environment_context>`). The boundary is `codexUserTurn`,
   already measured over all 6,334 rollouts and already serving three readers. A fresh "has a user
   message" predicate fuses every exchange into one turn the line budget can never evict.
2. **One prompt can be written TWICE** — a `response_item` immediately followed by an `event_msg`
   with identical text (924 pairs in the store). `isDoubleWrite` drops the second; without it every
   prompt shows twice with an empty turn between.
3. **There are TWO tool families, not one.** `custom_tool_call` carries `exec` and `apply_patch` and
   appears in **more than half the store**. The first version of this file knew only `function_call`,
   so more than half of all rollouts would have shown the prompt and the prose with the commands cut
   out (Codex review, round 1 — P2).
4. **And the output field is TWO shapes, in BOTH families.** Over 800 rollouts
   `function_call_output` is a string 12,580 times and an **array** 88 times, and
   `custom_tool_call_output` is an array 4,486 times and a **string** 269 times. So the original
   `function_call` handler was already dropping those 88 before this file had a second family to get
   wrong — a second site of the same class, found by measuring rather than by the finding.

**So the rule is by SHAPE, not by name.** Every payload type ending `_call` or `_output` is a tool
record by construction; an unrecognised one renders a row naming it rather than nothing. Scoped to
those two suffixes because codex adds NON-tool types routinely (`world_state`, `turn_context`), and
a row per unknown type would fill the view with things that are not conversation. Nothing in the
store hits the fallback today — it is a tripwire.

Tool calls show name + the head of the arguments (`arguments` in one family, `input` in the other);
tool results go through claude's own `toolResultRow`, so one result is not six lines for one agent
and whole for another.

## Behaviour preservation, proved rather than argued

Extracting `foldTurnRecord` out of `foldTranscriptView` is a claim that claude's view is unchanged.
A differential harness ran the OLD function beside the new one over **400 real claude transcripts and
4,000 generated sequences — 167,148 records, 0 mismatches.**

The harness could not survive (half of it was the code it replaced), so the two things that outlive
it were harvested into `transcript-view-codex.spec.ts`: the **generator** (which record shapes
matter, including the malformed ones) and the **property** — claude's fold equals the shared fold
plus claude's three renderers, checked over 2,000 generated sequences on every run.

## Mutation-verified

The reader:

| mutation | what went red |
|---|---|
| the agent chooses the reader | 2 — including the restarted-claude regression |
| `shell` is told "not supported" | 1 |
| a source's miss ends the search | 3 |

And the fold, after round 1's finding:

| mutation | what went red |
|---|---|
| only `function_call` is a call (the round-1 bug) | 2 |
| a tool output is only ever a string | 1 |
| an unrecognised tool record is dropped again | 1 |

The file was compared against a pristine copy before each mutation and restored after.

## Not in this PR

Cursor and copilot — each is its own PR on this skeleton, as #1822 asks. The phone's sentence for
`not-supported` is a mulmoserver change and is not needed for the host to answer it.
