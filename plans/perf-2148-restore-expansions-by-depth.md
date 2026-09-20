# perf(files): restore the remembered expansions one level at a time, not one directory at a time (#2148)

## What was left of #2148

Stages 1 and 2 shipped: the pane no longer says "Empty directory." before it has read anything
(#2150), and it paints the last root listing while the real one loads (#2153). Both are released.

What the issue still describes, and what neither stage touched, is the **structure** of the wait:

> `restore()`: 記憶している展開ディレクトリ**ごとに** `/list` を1回、`for` ループで**直列**
> つまり展開を N 個覚えていれば N+2 回の往復が順番待ちになります。

That is the whole of this change.

## The constraint is between DEPTHS, not between siblings

Opening a directory fetches its children, so a directory cannot be looked up until the level above
it has been read — `restoreOrder` existed for exactly that. But it returned a flat list, and the
caller awaited it one entry at a time, which applies the depth constraint to **siblings that do not
need it**.

Measured over the shapes a remembered set actually takes, the flat list is almost all avoidable
waiting: a set of top-level directories is one level, and nothing bounds how deep a set may go, so
the saving is whatever its shape gives — the flatter it is, the more of the waiting was avoidable.
Run `restoreLevels` over a remembered set and compare its group count with the input length.

So `restoreOrder` becomes `restoreLevels`, returning `string[][]`. The grouping puts the constraint
in the TYPE — a caller has to flatten deliberately to go back to serial — and `restore()` awaits
`Promise.all` within a level and the levels in order.

## Why not the cache the issue sketches

The issue's remaining proposal is to cache each expanded directory's children too. That is
**declined here, costed rather than attempted**, because of the hazard the previous session already
identified: `toggleDir` reads `node.loaded` as "these children are real", so cached children either
lie to it (and are never refreshed) or are not marked and are fetched again anyway. Doing it safely
means splitting `loaded` into "painted from cache" and "read from the server" — the same split
stage 1 made for `roots` — plus deciding the storage bound and what a click on a since-deleted file
does.

That is a larger change with a staleness surface, and this one has neither: nothing is cached,
nothing can be stale, and the same requests are made. It removes most of the wait the issue
measures. The cache can still be done afterwards, on top.

## What holds it

- `restoreLevels` has the grouping property pinned directly: siblings share a level, a path never
  shares a level with its own ancestor, and nothing is dropped on the way in.
- `FilesPane.spec.ts` mounts the real pane and watches **concurrency, not duration** — how many
  `/list` requests are in flight at once. A duration would be a flake; "three were in flight
  together" is exactly the difference between the two shapes. Reverting to the serial loop turns it
  red, and so does firing every level at once (which breaks the parent-before-child rule).
