# feat: the Files pane paints the last tree it saw while it re-reads (#2148 stage 2)

Stage 1 (#2150) stopped the pane claiming a directory was empty before it had read it. What is
left is the wait itself: opening the pane, and every re-root as the zoom walks between cells, shows
"Loading…" for a round trip that is not always quick.

## The change

The pane keeps the ROOT listing of each directory it has read, and paints it immediately on the
next open — then replaces it with what the server says. `roots` is no longer `null` in that window,
so no "Loading…" is shown at all for a directory that has been here before.

`src/components/filesTreeCache.ts` is the whole of it: parse, cap, read, write. Pure except for the
two `localStorage` accessors, which are wrapped where they are made, as `filesPaneStore.ts` does.

## Two decisions worth disagreeing with

**The PANE owns this, not the host.** The existing per-directory memory (#958) is written by
`TerminalGrid` from `snapshot()`, because what was open is the HOST's business — it decides which
cell comes back to which tree. A cache is not that: it is the pane's own optimisation, it has no
meaning outside the pane, and routing it through the host would leave the full-screen view
(`FilesOverlay`, which passes no `initial-state`) without it for no reason.

**Its own storage key, not a field on `files_pane_state`.** A listing is far bigger than the paths
beside it, and localStorage answers a quota failure by failing the whole write. Sharing the key
would mean a directory with a large tree could cost every OTHER directory its remembered open file.
Separate keys, separate failure.

## What is deliberately NOT cached: the expanded directories

`restore()` re-opens each remembered expanded directory with its own `/list`, sequentially, so a
pane with three expansions still makes three round trips before the tree is whole. Caching those
too is the obvious next step and it is not obvious how it should behave: `toggleDir` treats
`node.loaded` as "these children are real", and a cached child list would satisfy it — so either
the cache marks the node NOT loaded (and every expansion refetches while showing stale children,
which needs a second swap path) or it marks it loaded (and a stale child list is never refreshed
until the whole tree is re-read). That decision deserves its own PR and its own thinking; the root
listing needs neither, because `loadRoot` already replaces `roots` wholesale.

So: the first paint is instant, and the expansions arrive as they do today.

## Staleness, stated rather than hidden

A cached row can name a file that is gone. Clicking one asks the server, which refuses, and the
pane already shows that refusal — the same path as a file deleted while the pane was open. The
window is one round trip, and the alternative (blocking clicks until the real listing lands) trades
a rare error for a permanent hesitation.

A cached tree is NOT shown when the read fails: `treeError` still wins the template's first branch.
We do not know what the directory holds, and a stale tree under an error reads as if we did.

## Tests

`test/src/components/filesTreeCache.spec.ts` — the pure module, both directions: what it keeps,
what it drops, both caps, and a value of the wrong shape costing the cache rather than the pane.

`test/src/components/filesPaneTreeCache.spec.ts` — the pane: a first visit shows Loading and then
the tree; a second visit to the same directory shows the tree immediately, with no Loading frame,
and swaps in what the server returns; a re-root to a directory never seen still shows Loading; a
failed listing shows the error rather than the cached tree.
