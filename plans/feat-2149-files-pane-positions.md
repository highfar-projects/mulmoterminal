# feat: the Files pane comes back to where the reader was (#2149)

The pane remembers WHICH file was open, which directories were expanded, and (since #2137) whether
Markdown was being read or edited. It does not remember WHERE in any of it the reader was — the
file opens at the top and the tree scrolls to the top, every time.

## The two places, and the third that cannot be done yet

**The editor's caret.** `setDoc` replaces the whole document, so the selection and the scroll go
with it. The pane now remembers the caret as a **line and column**, not a pixel offset: the file is
often reopened in a pane of a different width, where a wrapped paragraph puts the same `scrollTop`
somewhere else in the text. `goTo` clamps a line past the end rather than ignoring it — the file
may have been edited since (by the agent working in the same directory, which is the ordinary case
here), and the nearest real line is closer to where the reader was than the top is.

**The editor's viewport.** Found by driving a browser, and invisible to every unit test: scrolling
moves neither the selection nor the caret. A reader who never clicks has a caret on line 1 while
reading line 130, so restoring only the caret puts them back at the top of a file they were in the
middle of — which is the case #2149 opens with ("長い `.md` や長いソースを読みながら"). The top
visible line is remembered beside the caret and applied AFTER it, because `goTo` scrolls the caret
into view and what was on screen is the authoritative answer to "where was I".

jsdom has no layout, so there is no viewport there to test. The contract is pinned in the unit
tests (an empty document has no top line; asking to scroll somewhere impossible does not throw or
move the caret) and the behaviour was checked by driving a real browser: seeded with `topLine: 130`
and reloaded, the pane came back with document line 130 at the top of the editor.

**The tree's scroll.** One number, restored after the remembered expansions have rendered — the
rows have to exist before there is anything to scroll past.

**The Markdown preview's scroll is NOT here, and cannot be without a decision that is not mine.**
The iframe is `sandbox=""`: no `allow-same-origin`, no `allow-scripts`. The app cannot read
`contentWindow.scrollY` (opaque origin) and the frame cannot report it (no scripts). What it renders
is `marked.parse()` output, and the sandbox is the whole of what contains it — so making the
position readable means `allow-same-origin`, which is a security decision that deserves its own
issue and its own reviewer, not a line in this PR.

## Where it rides

`FilesPaneState`, beside the open path — so both halves get, for free, exactly what #2137's view
mode got: per cell while the session lasts, per directory across a reload. The storage layer
validates each new field on the way back and drops it ALONE when it is malformed: losing a caret
costs a scroll position, while dropping the whole entry would cost the open file.

The caret is applied inside `loadFile`, next to the restored view mode and under the same
`id === fileReqId` guard, and only when the read actually landed on the remembered path and the
file is text. A caret is a place in a document; a path that now holds something else is not that
document.

## One test helper, because seven specs had the same copy

Adding two methods to `CmEditor` broke seven hand-written `fakeEditor` literals — silently, as a
call to a missing function, one spec at a time. They now share `test/helpers/cmEditorDouble.ts`,
typed as `CmEditor`, so the next method added to the interface stops the build in one place instead.

## What is deliberately not remembered

**A pixel-exact scroll offset.** A line is coarser than `scrollTop` and survives what `scrollTop`
does not: a different pane width, a different font size, a wrapped paragraph. Coming back one line
off is not a cost a reader notices; coming back to the wrong part of the file is.

**A caret per file.** Only the OPEN file's caret is kept, because that is what the snapshot
describes. Switching A → B → A inside one session loses A's place. Keeping a caret for every file
ever opened is a second store with its own cap and eviction, and the complaint this answers is
about coming back to a cell, not about switching files inside one.
