# feat: move a terminal from the keyboard and the command palette (#2409)

Part of #2311.

## Decision

- Two actions, `terminal-move-prev` / `terminal-move-next`, in `KEYMAP_ACTIONS`. Unbound by default.
- Which terminal: the enlarged one, else the cell the cursor is in — the same rule `mark-unread`
  uses, so they are NOT in `NEEDS_A_CURRENT_TERMINAL`.
- Manual order only (`NEEDS_MANUAL_ORDER`). The key path's gate (`gateShortcut`, now given a
  `GridKeyState` of `{ zoomed, manualOrder }`) declines a move outside manual order, exactly as it
  declines the zoom-gated actions: a single-key binding falls through to the terminal or a same-key
  `send` (the keymap check names that fall-through), and a two-key sequence is claimed with nothing
  run — the `usePrefixKeys` contract for every action that declines in the current state. The palette row gives the same reason.
- Which terminal and which way is one pure function, `terminalMove` in
  `src/composables/gridShortcut.ts`; the grid applies it with the existing `moveCell`.
