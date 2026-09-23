# refactor: lift the Files pane's directory tree into a composable (#2158)

## Why

`FilesPane.vue` had been at the repo's 600-line `max-lines` cap for four consecutive changes. Each
one had to pay for its own room: #2151 moved the row menu out, #2153 arrived with a line to spare,
#2156 crossed the cap twice on the way in and was rewritten both times to fit. That is the cap doing
its job, and it is also a bad way to decide a design — the shape that fits is not always the shape
that is right.

The tree is the biggest thing in the file and the one with the fewest ties to the rest of it.

## What moved, and what did not

Moved to `src/composables/useFilesTree.ts`: the forest and its two companions (the error that
replaces it, and the request generation that decides which answer is still wanted), the listing
fetch, the cache paint, `loadRoot`, `toggleDir`, the visible-rows flatten and the node lookup.

Stayed in the pane: **the markup**. What renders does not move, so the DOM is identical by
construction — the same trade `useFilesRowMenu` took in #2151.

Also stayed: everything about the OPEN FILE. The tree and the editor share a pane and almost
nothing else; the two places they touch are `restore()` (expand the remembered directories, then
open the remembered file) and the row click, and both read as well from outside the tree as inside.

## Three decisions became reachable

`flattenRows`, `findIn` and `adoptListing` are exported and pure. They were nested inside the
component before, so the only way to ask them anything was to mount a pane and read the DOM. Each
one is a decision worth being able to ask about directly:

- which rows are visible, and at what depth — including the one a mounted test never produces: a
  FILE whose `expanded` flag is somehow true must not render its `children`
- whether a path is in the forest, including inside a collapsed directory, which is the case
  `restore()` depends on
- what a fresh listing keeps from the tree it replaces — a directory the user opened while the
  listing was in flight, and nothing else

## One type, not two

`filesTreeCache.ts` called a listing row `CachedEntry` and the pane called the same three fields
`Entry`. It is one concept — a row of a listing, wherever it came from — so it is now `ListingEntry`
in one place.

## How behaviour preservation was proved

1. **Every Files-pane spec runs unchanged.** They drive the tree through the pane and never name the
   composable, so the lift cannot satisfy them by construction.
2. **A differential harness, before and after.** It mounted the pane across a grid — a flat
   directory, an empty one, a listing that fails, a nested tree walked open and closed and open
   again, an expansion that fails, and a directory painted from the cache and then replaced — each
   with and without a remembered state to restore, and with the root listing HELD so the in-flight
   state is observable. At every step it recorded the tree's rendered markup, every row with its
   indentation, and the sequence of listing requests. **The two captures compare identical.** The
   harness is deleted; its generator and properties are the spec above.
