# feat: `mark-unread` keymap action (#2335)

## Goal

#2299 lets the cockpit roster's row menu mark a cell unread / read. Do the same from the keyboard,
so someone walking cells with `next-attention` / `zoom-next` / `zoom-prev` can flag one to come back
to without reaching for the mouse.

## Behaviour

- Action id `mark-unread`, bindable in `keymap`, and listed in the command palette under the same name.
- A toggle, exactly as the row menu decides it (`attentionAction` in `src/components/rowMenu.ts`):
  idle -> unread, done / blocked -> read, working -> nothing.
- Same preconditions as the row menu: a terminal cell holding a session, with its socket open.
  Otherwise the key does nothing.
- What unread looks like (green, no sound, no push) is the server's #2299 decision and is not touched:
  the key goes down the same `sendAttention` socket message.

## Which cell

The enlarged cell when one is; otherwise the cell holding the cursor — the one `next-attention` and
`focus-next` move to in the tiled grid. That is the same rule `terminal-new-here` uses, and it is
what makes the issue's flow work un-zoomed (`next-attention` never enlarges). So the action is in
neither `NEEDS_A_CURRENT_TERMINAL` nor `NEEDS_NOTHING_ENLARGED`.

## Shape

- `common/keymap.ts` — add to `KEYMAP_ACTIONS`.
- `src/components/markUnreadKey.ts` — pure: which uid and which direction, from the grid's state.
  Specced both ways (every status, missing cell, not markable, disconnected, no cell at all).
- `GridView.vue` — `runCellShortcut` routes the action through it to `conn.sendAttention`.
- Labels and palette descriptions in all five locales; `keymapLabels.ts` is a full Record so a
  missing one is a type error.
- Docs: the action table in `docs/guide/{en,ja}/config.md`, and `mulmoterminal-keys` SKILL.md.
