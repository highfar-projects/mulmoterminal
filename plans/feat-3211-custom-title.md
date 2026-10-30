# feat: use the `/rename` name (custom-title) as the session title (#3211)

Claude Code writes `{"type":"custom-title","customTitle":"…"}` into the transcript for `/rename`,
and again on later saves. Nothing here read it, so the resume list and the palette showed the
ai-title or a prompt instead.

## Decision

- Fold `customTitle` with the other disk title fields (last one wins, empty clears it).
- Tier order for the list: memo, custom title, live ai-title, disk ai-title, last prompt, first user message.
  Memo stays first because it is written in MulmoTerminal; the rename is the user too, so it beats anything generated.
- The phone roster's disk fallback gets the same tier at the top.
- Cached fold version bumped, so old sidecars are recomputed.

## Left out

- Filter box on the resume list (separate request in the issue).
- Cell header and live phone rows that already hold an in-memory title: they do not read the transcript per request.

## Risk

The cold read of a very large transcript trusts the tail window for the custom title. Absence there
cannot be told from a rename further back; Claude Code rewrites the line on later saves, so it was
within a few KB of EOF in measured files.
