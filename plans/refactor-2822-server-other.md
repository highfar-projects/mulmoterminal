# refactor: the "server-other" cluster of #2822

Behaviour-preserving extractions that remove jscpd clones flagged in code scanning.

## Extracted

- **`contentOf`** (cursor transcript record -> its `content` array). Byte-identical in
  `server/agents/cursor-last-turn.ts` and `server/session/transcript-view-cursor.ts`; the second
  already imported from the first, so it is now exported there and the copy is gone.
- **`server/backends/sourceEditorDispatchRoute.ts`** — the load/save dispatch route a plugin View's
  source editor posts to. `html.ts` and `shapescript.ts` were the same handler with different
  kinds, guard, error text and package executor; each now passes those as data.
- **`common/resolveRelativeSegments.ts`** — `.`/`..` resolution under a root, null on a climb above
  it or on the root itself. Was written twice: `joinWithinBase` (server, Markdown image `src`) and
  `resolveSegments` (UI, terminal path clicks). It is lexical only: each caller still chooses its
  own root and normalises separators itself, so no surface's containment changes
  (`docs/file-surfaces.md`).
- **`declare.ts`**: `reserveNewApp` (mint the aid, build the roster-of-one reservation, claim it),
  `unwrittenReservation` (the PARTIAL refusal after a failed manifest write, wording keyed by
  `init` / `fork` the way `reserveApp` already is) and `nameWrittenApp` (that refusal, else take
  the URL name now). `init` and `fork` each ran this sequence inline.

## Why behaviour is preserved

Old code copied verbatim into a throwaway harness and run beside the new over generated inputs,
whole results compared (route status + body + files on disk + published file changes; init/fork
results + app.json + Firestore writes with a deterministic aid). A deliberate mutation of each new
function was confirmed to turn the harness red. The generators and properties were kept as
permanent specs: `test/common/resolveRelativeSegments.spec.ts`,
`test/server/backends/sourceEditorDispatchRoute.spec.ts`,
`test/server/backends/declareUnwritten.spec.ts`.

## Declined

- **`spawn-copilot.ts` / `spawn-cursor.ts`**. The flagged span is the import block plus the
  spawner's signature. The only real shared code is the PTY start inside `withSettingsCleanup`,
  which the claude / grok / muse / antigravity spawners share too, so a helper for it belongs in a change that covers
  every spawner (files outside this cluster). Reordering imports to dodge the detector would hide
  the match without sharing anything.
