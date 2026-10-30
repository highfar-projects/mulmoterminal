# feat: show the /rename name on the cell header, roster and recently closed (#3229)

Continues #3211 / #3226, which put the `/rename` name (`custom-title`) on the resume list and the
phone's disk fallback. Three surfaces still ignored it.

## Where the name comes from

`GET /api/session/:id` already folds the whole claude transcript (`readSessionSummary`, no windows),
so the name rides on that fold and costs no extra read. It is not in the live title push, which
carries only the in-memory `ai-title` copy.

## Change

- Summary fold: `customTitle` joins `aiTitle` (last wins, an empty rename clears). The rule is
  `customTitleOfRecord`, shared with the resume list's title fold so the two cannot drift. The
  on-disk fold's `version` goes 1 to 2, so an old sidecar is not read as "no name".
- Detail view: `customTitle` comes from the transcript, and is null for a cleared session (the same
  persisted mark that blanks the prompt), so a name given before `/clear` is not shown against the
  new conversation.
- Client: `SessionMetaView.customTitle` (an explicit null wins in the merge, an absent field keeps
  it), the roster row's summary, `closedTitle`, and the cell header. The order everywhere is memo,
  `/rename` name, AI title, prompt.
- Cell header: `customTitle` is cell state, set from the detail fetch on mount, on reconnect and
  at the end of a turn. It is not an activity push field, and it is applied outside the guard that
  drops a seed when a push landed mid-fetch, because that guard protects working/waiting, not a
  fact read off the transcript.

## Left out

- Pushing a rename the moment it is typed. The name appears on the next detail fetch (mount, reconnect,
  turn end).
- The resume list's filter box: #3230.
