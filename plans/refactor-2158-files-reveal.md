# refactor: lift the Files pane's reveal and finder into a composable (#2158)

## Why

The last of the extractions #2158 asks for. The tree went out in #2169, the open file in #2174,
and what was left in `FilesPane.vue` that is not markup was mostly the REVEAL: open a path and put
the tree on it, with the finder panel that is one way of asking for that.

The pane is well under the size limit now, so this is not about the cap. It is about the reveal
being the one thing in the file with three generation guards in it, and none of them reachable
without mounting a pane and holding a fetch open at the right moment.

## What moved, and what did not

Moved to `src/composables/useFilesReveal.ts`: `finderOpen` and its close, the pick handler, the
reveal generation, `revealPath`, and the row lookup.

Stayed in the pane: the finder's markup and the search panel that also calls `revealPath`, plus
`treeEl` — the pane renders the tree, so it owns the element, and hands it over as a ref.

## The two halves are one composable on purpose

The finder has no other purpose: picking in it IS a reveal, and the panel closes because the
reveal is starting. Splitting them would leave two files whose only content is each other's call.

## Why `started` is a getter

`reload()` replaces the startup promise. A reveal that captured the old one would wait for a tree
that is no longer being built — so the composable asks for it at the moment it awaits, exactly as
the pane's own `await started` did.

## How it was proved

A throwaway differential harness drove the pane through its real UI — the finder button, the
input, a clicked row — over eight scenarios: a deep pick, a root pick, two picks racing with the
inner listing held open, a pick that beats the root listing, a pick followed by a re-root, Escape,
a click outside, and a read that fails. It recorded the tree rows, whether the panel was up, what
it was offering, the header, the snapshot, the request sequence and the scroll count after every
step. Every record came back identical. The harness is deleted.

What survives it is `test/src/composables/useFilesReveal.spec.ts`.

## The sweep found two guards nothing tested

A mutation sweep over the reveal's decisions caught 6 of 10 with the pre-existing pane specs. The
four it missed are now covered, and two of them are the ones worth naming:

- **the guard after the startup wait** — both picks can be parked in the same startup, because the
  `files-find` shortcut opens the panel over a pane whose tree is still being read. The first to
  resume has to find that it already lost.
- **the guard before scrolling** — the file was read, and the pick changed while it was being
  read. The tree now belongs to the other file, so scrolling to this one moves the reader off it.

Observing the second needed a rendered tree, because what it changes is only the scroll. The
spec builds rows whose `scrollIntoView` records itself; jsdom has neither layout nor that method.

The other two: `reset()` bumping the generation, and `rowElementFor` matching a whole path rather
than a prefix.

## `rowElementFor` is exported, and that is the point of it

It walks the rendered rows instead of building `[data-path="…"]` because a filename may hold a
quote or a backslash — that selector is a `SyntaxError`, not a miss, and the reveal would die on
the one file whose name caused it. A mounted pane cannot easily be given a file named `a"b`, so
the reason the function exists was untestable until it had a door of its own.
