# feat: move a terminal from the keyboard and the command palette (#2409)

Part of #2311.

## Decision

- Two actions, `terminal-move-prev` / `terminal-move-next`, in `KEYMAP_ACTIONS`. Unbound by default.
- Which terminal: the enlarged one, else the cell the cursor is in — the same rule `mark-unread`
  uses, so they are NOT in `NEEDS_A_CURRENT_TERMINAL`.
- Manual order only (`NEEDS_MANUAL_ORDER`). In auto / priority order the next sort would undo the
  move, so the grid does nothing and the palette row gives the reason instead of running it.
- The decision is one pure function, `terminalMove` in `src/composables/gridShortcut.ts`; the grid
  only applies it with the existing `moveCell`.

## Not done

- A bound key is still consumed outside manual order (the grid's key handler ends in
  `preventDefault`). Gating it by order in `gateShortcut` would need the order passed through the
  key path; left for now because nothing is bound by default.
