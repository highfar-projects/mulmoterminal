# Right pane overflows the window on one long line (#2899)

## Reproduced

On the real app (this checkout's server and Vite, isolated `HOME`, no tmux), a shell cell enlarged, history →
Conversation, with a claude transcript whose answer holds a 300-character unbreakable string:

- full: the pane's section is wider than the window and its reload / expand / close buttons sit past the right
  edge — the same at viewport widths 800, 1200 and 1600;
- split (expand toggled off): the section overflows too.

## Cause

`TerminalGrid.vue` gives Tools, Prompts, Conversation, Collections and Question `width: auto` while full. A flex
item's automatic minimum width is its min-content width once its width is auto, so the unbreakable line sets the
pane's minimum and `flex: 1 1 0%` cannot shrink it. GuiPanel, sized by the same row, carries `min-w-0` on its root
and does not overflow.

## Fix

The five identical style expressions become `rightPaneStyle(full, splitWidthPx)` in
`src/components/rightPaneStyle.ts`, which adds `minWidth: 0` in both modes. Split mode keeps its fixed basis, but the
automatic minimum could still enlarge a pane past it (the split overflow above); a zero minimum stops that.

Not changed: the pane opening full first, and split after a reload (out of scope per the issue).

## Verified

- the same real-app run after the fix: the section ends at the window's edge and the close button is inside it at
  800, 1200 and 1600; split is the configured pane width; close closes the pane; the long line wraps;
- `test/src/components/rightPaneStyle.spec.ts` pins the two shapes, that `TerminalGrid.vue` holds no
  `width: 'auto'` of its own, and that each of the five panes is sized through the helper; dropping `minWidth` from
  the helper, or giving any one pane another style, turns it red.
