# feat: the Files pane comes back in the view mode it was left in (#2137)

## The gap

The Files pane already remembers the open file and the expanded tree across a reload (#958) and
across walking the zoom to another cell. It does not remember **which of its two views was up**,
so reading a `.md` in Preview ends every time you come back: the file is there, and it is in the
editor.

Two things hold it that way, and fixing either alone changes nothing.

1. `FilesPaneState` carries `openPath` and `expanded` only, so neither save route — the uid-keyed
   map in `TerminalGrid.vue` nor the directory-keyed `files_pane_state` in localStorage — has
   anywhere to put the mode.
2. `loadFile` resets `showPreview` **unconditionally**, and restoring goes through `loadFile`. So
   a mode added to the snapshot would still be thrown away on the way back in.

## What the unconditional reset is for

It is not gratuitous, and it cannot simply be deleted. The preview iframe is shown on
`openPath && !unpreviewable && showPreview` — it does **not** ask whether the file is Markdown.
The Preview *button* asks (`v-if="openPath && isMarkdown"`), so a preview left up while a
non-Markdown file is opened is an iframe over the new file **with no way back to the editor**.
That is what the reset beside `unpreviewable.value = null` prevents.

The rule it is a blunt version of: **the view mode belongs to the file it was turned on for.**

## The change

Two pure rules, in `src/components/filesPreviewMode.ts`, so both directions are testable without
mounting a pane:

- `keepsPreview(openPath, nextPath)` — loading ANOTHER file drops the mode; re-reading the SAME
  one keeps it. The same-path callers are the conflict banner's Reload and the external-change
  refresh, and neither is a reason to throw a reader back into the editor.
- `restoresPreview(remembered, reopened)` — a remembered Preview comes back only over the very
  path it was remembered for, and only while that path still holds Markdown the server served as
  text. A `.md` since replaced by a binary falls back to the editor rather than to a blank iframe.

`FilesPaneState.showPreview` is **optional**, and the storage layer treats a value of any other
shape as absent rather than dropping the entry: an entry written before this existed must cost the
reader the mode at most, never the open file they came back for.

## What is deliberately not here

In Preview, an external change to the open file now KEEPS Preview instead of dropping to the
editor — and the preview iframe's URL still does not carry a version, so the rendered HTML is the
one the server produced when the file was opened. Making the preview follow the file is **#2136**
(its stage 1 is exactly that cache-bust); it is a different fix in a different place, and bundling
it here would mean one PR that could be reverted in two halves.
