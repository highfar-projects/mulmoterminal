# fix: a located open leaves the Canvas view (#3010)

## Problem

A terminal path with a line (`design.md:42`) on a file in the Files pane's Canvas view (#3008)
brought the file forward still in the Canvas view, so the line was not shown.

## Decision

A line lives in the text. `useRequestedOpen.openAt` already turns a Preview back to Edit for that
reason; the Canvas view now follows the same rule. `openAt` takes a `showText(pathRel)` hook, and
the pane passes `canvasMode.hide`. It is called before the open, so the file does not start building
its card only to be put away. The REQUEST, not the landing, exits the Canvas view: a located open that is declined or
superseded still leaves the file on its editor for the next visit (settled with Codex in review; a
test pins it).

Unchanged: a path click with no line, a tree click, a tab switch — the Canvas view is kept. The
full-screen view's `?path=&line=` goes through `openAt` too, but it has no Canvas view.
