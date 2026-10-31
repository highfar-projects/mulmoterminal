# feat: stack the right pane's panes (#3213)

## Problem

A cell's right pane is one slot (`RIGHT_PANES` in `src/components/gridCell.ts`). Opening the
conversation over Files replaced Files, and closing the conversation emptied the slot, so Files was
gone too.

## Decisions (made one at a time on the issue)

- Panes opened in turn stack; closing the one on screen shows the one it covered. Still one pane on
  screen.
- Opening a pane already in the stack moves it to the top, so each pane is in it at most once, and
  the stack needs no depth limit.
- The question pane is NOT stacked. It covers the top pane while its question is open; answering
  or closing it shows that pane again. Opening another pane over it takes its place (the question
  can still be answered in the terminal). It is not remembered across a reload.
- A reload brings the whole stack back. The value remembered before (one pane per session) reads as
  a stack of one.
- Coming back to Files already restores its tabs, expanded folders and scroll (`rememberPaneState` /
  `claimPaneState`); nothing to add. The issue's note that leaving Files forgets the directory was
  only true after a re-root declined over unsaved edits.
- Full width: the conversation takes the row whenever it becomes the pane on screen, including
  when the pane over it is closed. No other pane inherits it.
- No "close all": the close button closes the top one.
- A question covering Files saves its buffer first (the editor unmounts beneath it, and nothing
  saved it on the way there before either). A buffer that cannot be saved keeps Files on screen, as
  every other way off Files does.

## Shape

- `src/components/rightPaneStack.ts` (pure): `CellPanes { stack, question }`, `withPaneOpened`,
  `withShownPaneClosed`, `shownPane`, `readStack` (the remembered value, both formats).
- `TerminalGrid.vue`: `paneByCell` holds a `CellPanes` per cell. `setRightPane(pane | null, uid)`
  keeps its signature — a pane opens, `null` closes the one on screen — so every caller is unchanged.
  `localStorage["pane_open_by_session"]` holds a stack per session.

## Tests

- `test/src/components/rightPaneStack.spec.ts`: the rules.
- `test/src/components/rightPaneStackGrid.spec.ts`: through the grid — Files back after the
  conversation, move to top, full width on return, the question overlay (answered, closed by hand,
  replaced), reload, the earlier stored format.
