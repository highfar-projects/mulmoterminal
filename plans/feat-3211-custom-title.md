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

## Cold read of a huge transcript

The cold read answers from the two ends of the file. A custom title found in the tail is the last
one, since the tail runs to EOF. When the tail has none, the file is searched for the record type
as raw bytes, and only a file that mentions it is folded whole. A never-renamed file therefore
costs one streaming scan, once, and the result is cached beside it.
