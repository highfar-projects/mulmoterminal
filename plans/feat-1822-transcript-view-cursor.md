# feat: the phone's conversation view reads cursor

Issue: [#1822](https://github.com/receptron/mulmoterminal/issues/1822). The SECOND per-agent
implementation, landing on the skeleton #2078 built. Nothing about the reader's shape changes here —
a source is added to the list and a fold is written.

## The lesson from #2078, applied

#2078's codex fold was written from ONE rollout sampled whole, and the cross-review found what that
could not show: `custom_tool_call` is in 52% of the store and the fold did not know it existed. So
this time the shapes were counted over **every cursor transcript on this machine — all 35, the whole
store, not a sample**:

| | |
|---|---|
| record kinds | `role: assistant` 57 (34 files) · `role: user` 40 (35 files) · `type: turn_ended` 34 (34 files) |
| content parts | `assistant/text` 48 · `user/text` 40 · `assistant/tool_use` 19 |

Three record kinds and three part types, and that is the whole store.

## What cursor's own shapes cost

1. **The prompt is wrapped**, as `<timestamp>…</timestamp>\n<user_query>…</user_query>`, and cursor
   does NOT escape the marker — a prompt containing the literal `</user_query>` sits verbatim inside
   the wrapper (measured in #2072). `cursorUserText` unwraps first-open-to-LAST-close, and it is
   SHARED with the conversation list's titles rather than copied.
2. **`tool_use.input` is an OBJECT** (`{ command, description }`), where both of codex's families
   carry a string. It is serialised, under the same cap codex's calls get — and the serialise is
   guarded, because a value that will not stringify must not throw inside a read the phone polls
   every five seconds.
3. **There are NO tool results in the transcript at all** — zero `tool_result` parts and zero result
   records across the whole store. So a cursor turn shows what was asked, what was said, and WHICH
   tools ran, and never what they answered. That is cursor's file, not a gap in this reader, and it
   is stated in the protocol doc and the capability matrix rather than left for someone to discover.
4. **Cursor's records carry no timestamp field.** The `<timestamp>` in the wrapper is prose inside
   the prompt. A turn's `at` is null, which is what that null is for — a turn is worth more than its
   clock.

## The small store is why the unknown row is load-bearing

35 transcripts, most of them this project's own probes, against codex's 6,905. The confidence that
"these are the only part types" is correspondingly weaker — so an unrecognised content block renders
an **`unknown` row** rather than nothing, from **claude's own `unknownRow`** (exported for this, the
way `toolResultRow` already was): one shape for "a block no reader here understands", naming the
type rather than carrying the block, because a block has no size bound and this view has a byte cap.
Here that row is what makes a shape this store never held visible on the phone instead of silently
thinning the view.

## Verified against a real transcript, not only fixtures

`sessionTranscriptView` run against a real cursor chat on this machine
(`8b4146c9-5f37-4328-beb7-8732cf88d564`), through the actual reader and source list:

```json
{ "status": "ok", "turns": [
  { "at": null, "rows": [
      { "kind": "user", "text": "Run the shell command: echo E2EOK" },
      { "kind": "tool", "text": "Shell {\"command\":\"echo E2EOK\",\"description\":\"Echo E2EOK to stdout\"}" },
      { "kind": "assistant", "text": "`E2EOK`" } ] },
  { "at": null, "rows": [
      { "kind": "user", "text": "Say exactly SECONDTURN" },
      { "kind": "assistant", "text": "SECONDTURN" } ] } ],
  "truncated": false }
```

## Mutation-verified

| mutation | what went red |
|---|---|
| the prompt is not unwrapped | 5 |
| an unrecognised content block vanishes again | 2 |
| a user record renders its own text too (every prompt twice) | 5 |
| a `tool_use` input is printed rather than serialised | 2 |

The file was compared against a pristine copy before each mutation and restored after.

## Where cursor sits in the source list

LAST of the three, and by cost: claude joins one path, codex scans a day tree, cursor reads every
project directory's `.workspace-trusted` to learn which one stands for this cwd — the slug is a
truncated-and-hashed path that cannot be reconstructed. The route is polled every five seconds per
open session, so the cheapest question goes first.

## Not in this PR

Copilot — the last of the measurable four, and the cheapest of them (its `turns` table is one row per
turn with the prompt and the reply already separated). grok, muse and antigravity remain not
measurable on this machine.
