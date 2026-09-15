# The phone reads a copilot conversation (#1822)

The FOURTH per-agent implementation of the conversation view. claude and codex landed in #2078
with the `not-supported` status; cursor in #2081. Copilot is the last of the measurable four.

## What was measured, and it is the whole store

Against **copilot CLI 1.0.83**, `~/.copilot/session-store.db` (read through the WAL on a COPY, so
a read-only handle that cannot see uncheckpointed pages is not what produced these numbers):

| table | rows |
|---|---|
| `sessions` | 8 |
| `turns` | 8 |
| `session_files` | 1 |
| `checkpoints` / `session_refs` / `forge_trajectory_events` | **0** |
| `assistant_usage_events` | 11 |

Six sessions carry turns. Six of the eight turns are this project's own probes ("reply with just:
ok", "Reply with just the word pong", "Run the shell command 'echo probe-ok'"); the one real
conversation is two turns of Japanese.

## Why a store that small is still enough here, when cursor's 35 barely were

**The shape is DECLARED, in SQL.** Cursor's and codex's folds had to be measured because the
question was *which record means what* inside an untyped JSON blob — that is what produced codex's
`custom_tool_call` miss (52% of the store, invisible in one sample) and cursor's unwrapping rule.
Copilot answers that question in its own schema:

```sql
CREATE TABLE turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  turn_index INTEGER NOT NULL,
  user_message TEXT,
  assistant_response TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, turn_index)
);
```

One row is one turn, prompt and reply already separated and already named. There is no part type to
recognise, no wrapper to strip, no double write to guard. So the risk the small store carries here
is not "a shape we have not seen" — it is only "a column that changes name", which is a schema
migration and fails loudly rather than thinning the view.

That is also why this reader needs **no `unknown` row**: there is nothing for one to catch. Cursor's
is load-bearing because a new part type would otherwise vanish; copilot has no part axis at all.

## The limitation to state: NO TOOL ROWS

`forge_trajectory_events` is where a tool call would go — its columns are literally `tool_call_id`,
`command`, `output`, `exit_code`. It holds **zero rows**, including for the two sessions that
demonstrably ran tools (one ran `echo probe-ok`, one created a file). So this is not "our probes did
no work"; 1.0.83 does not write that table.

The only tool trace anywhere in the store is `session_files`: one row, `tool_name = "create"`,
`turn_index = 1`. It is **not** usable as a tool row — `UNIQUE(session_id, file_path)` makes it a
deduped "files seen in this session" index, so a file touched in turns 1 and 3 appears once and is
attributed to turn 1. Rendering it per turn would under-report and mis-attribute, which is worse
than the honest gap.

**So a copilot turn shows what was asked and what was said, and nothing about what ran.** That is
thinner than cursor (which shows WHICH tools ran, but not what they answered) and much thinner than
claude. It is copilot's file, not a gap in this reader.

## The plumbing is the actual cost — copilot is not "the cheapest" the way #2081 predicted

`plans/feat-1822-transcript-view-cursor.md` called copilot the cheapest of the four remaining, on
the strength of the table above. That is true of the DATA and false of the WIRING, and the
correction belongs here rather than in a reader six months from now.

Every source today is a FILE: `TranscriptSource.locate` answers a path, and `viewFromSource` opens a
handle, stats it, and reads a byte window off the TAIL, widening two to four times when the window
opens mid-turn. Copilot has no file — it has a table, and its natural window is
`ORDER BY turn_index DESC LIMIT n`, not a byte count.

So `TranscriptSource` becomes a two-member union, discriminated by `kind`:

- `kind: "file"` — `locate` + `createFold`, exactly as today, byte-for-byte unchanged for claude,
  codex and cursor.
- `kind: "query"` — `scanFor(cwd, id)` answers a `TranscriptScan` or null, and the shared
  `transcriptViewOf` finishes it. The budget (`withinByteCap`, the line count, the eviction) is the
  same because it lives in the scan, not in the reader.

`hasReader` is derived from the same list, so wiring copilot removes it from `not-supported` by
construction — that is already how the list works and needs no change.

**This touches the shared read path every agent goes through, so behaviour preservation for the
three existing sources is a CLAIM that has to be run, not argued** (`/refactor-safely`): the file
branch must produce identical views before and after the union.

## The prompt row is emitted by the source, not left to the fold

The trap #2081 paid for, and copilot walks straight into it: `foldTurnRecord` supplies the prompt
row ONLY when the boundary record rendered nothing. A copilot row carries the prompt AND the reply,
so handing it `{ prompt: user_message, rows: [assistantRow] }` would render the reply and silently
drop the question. The source emits both rows itself.

## What was verified, and how

**The union is a change to the shared read path, so "the three file sources behave the same" was RUN,
not argued.** A throwaway harness asked both trees — `e8c19dd9` (before the union) and this one — for
the whole `TranscriptView` of the same session list, and compared the JSON of every answer: the
status, the `truncated` flag, and every row of every turn. Not a summary, which is what would hide a
row moving between turns.

The input set is the whole store on this machine rather than a sample: **7,083 (cwd, id) pairs** —
every claude transcript of this project, every cursor chat under `~/.cursor/projects`, and every
codex rollout under `~/.codex/sessions`.

**Result: 7,083 inputs, one differing id, and it is not a behaviour difference.** The one that
differed is this session's own live transcript, which grew by several KB between the two runs. Shown
rather than assumed: re-running BOTH trees on that id back to back, against a file whose size did not
move, produced identical output.

**Break-verification.** Each mutation applied to a file checked against a pristine copy first, and
restored and re-checked after; the three files matched their pristine copies at the end.

| mutation | tests that went red |
|---|---|
| the prompt is left to the fold (the #2081 trap) | 6 |
| a prompt-less row folds into the previous turn | 1 |
| an empty row still opens a turn | 1 (2 with its sibling) |
| `String()` instead of `readString` on the columns | 1 |
| the cwd drops out of the query (the machine-global hole) | 1 |
| the oldest turns are kept instead of the newest | 1 |
| copilot never joins the source list | 1 |

The denominator is honest about what it is: this reader is new, so every test above is new too. The
number says these decisions are catchable, not that a pre-existing suite catches them.

**Read against the real store, through the real reader** — the external ground truth, not another of
our own outputs. The two-turn Japanese conversation in `~/mulmoclaude` and a two-turn probe session
both fold correctly, prompt and reply in order with their timestamps. And the same real id asked from
a DIFFERENT directory answers `none` rather than that conversation, which is the cwd scoping working.

**What the fourth source costs on the poll path**, measured at 200 calls each under a load average
around 30:

| | ms/call |
|---|---|
| the copilot source alone, on a miss | 0.96 |
| the copilot source alone, on a real session | 0.96 |
| the whole miss path, all four sources | 8.72 |

So copilot adds about 1 ms to a miss — the sqlite open dominates, and a hit costs the same as a miss.
It is asked last for that reason and because `node:sqlite` is imported lazily on the first call, which
keeps that import off the path the overwhelming majority of cells take.

## Not in this PR

grok, muse and antigravity. Unchanged from #2081: there is no data for them on this machine, and
the #1822 lesson is that a fold written without counting the store is how `custom_tool_call` was
missed. They keep answering `not-supported`, which is the honest answer and already shipped.
