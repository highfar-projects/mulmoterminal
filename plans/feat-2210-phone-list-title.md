# feat: phone terminal list — name every row, and carry the latest prompt (#2210)

Scope: the host side (this repo) of #2210, items 1 and 3. The path display (item 2) is the
phone's rendering and belongs to mulmoserver.

## 1. A row never headed by a bare UUID when anything better exists

A row falls back to its id only when it is LIVE and the in-memory tiers (memo, live AI title,
knownSessions title) are all empty — `buildSessionList` drops nameless non-live rows. So only
those rows need more, and only those pay for a disk read.

Greedy tiers, after the existing three, in this order:

1. the on-disk `ai-title` (claude transcript, the sidebar's cached fold)
2. the agent's own store title (`agentSessionTitle`, non-claude agents)
3. the live meaningful prompt (`lastPrompts`)
4. the on-disk `last-prompt`
5. the first user message
6. `<project basename> · <agent>` — identifies a brand-new session with no conversation yet
7. the id

A `/clear`ed session (`clearedTranscripts`) skips every disk tier: its transcript is the
conversation the user ended.

Membership of the list does not change: the disk tiers only rename rows already shown.

## 3. `prompt` on each row

`TerminalSessionSummary` gains an optional `prompt`: the live meaningful prompt, else (claude,
not cleared) the on-disk `last-prompt`. Collapsed to one line and capped, omitted when empty or
equal to the title, and the key is absent rather than `undefined` (Firestore refuses the whole
reply otherwise, #1042). The phone ignores it until mulmoserver renders it.

## Pure / impure split

- `server/backends/remoteHost/phoneRowText.ts` — pure: tier order, location label, one-line cap,
  prompt de-duplication. Unit-tested in both directions.
- `hostSessionList.ts` — the reads, passed in.
