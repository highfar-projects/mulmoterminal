# feat: mark a cell unread from the cockpit roster (#2299)

## What

The roster row's ⋮ (`CockpitRowMenu`) becomes the row's action menu, always shown, and also
opens at the pointer on a right-click of the row:

1. top — the attention action: idle → "Mark unread", done / blocked → "Mark read", working → none
2. middle — move up / down (manual sort only, as today)
3. bottom — set aside / wake, close (red)

"Mark unread" sits at the opposite end from set aside / close so a slip does not end a session.

## Decisions

- **Unread restores green, never amber.** Amber says the agent is really blocked on input;
  faking that would send the user to a dialog that is not there. It also means nothing has to
  remember which colour was cleared.
- **Unread carries its own event, `MarkedUnread` (`common/markedUnread.ts`), not `Stop`.** The
  attention sound announces a `Stop` that raises `waiting` as a finished turn, so reusing it beeped
  on every mark (seen in the real app as a `/api/dir-sound?kind=finished` fetch). `activityStatus`
  already reads any non-`Notification` waiting as done, and `notifyKind` returns nothing for it.
- **The wire is a new `attention` frame on the cell's own socket** (`{ type: "attention", waiting }`),
  handled beside `view` in `pty-connection.ts` and applied with `setWaiting`. The clear-on-view rule
  is untouched, so marking the ENLARGED row unread holds until it is next brought into view.
- **Close from the menu takes the `terminal-close` path** (GridView `onClose`): the session ends, a
  worktree is kept. The worktree keep/remove dialog lives inside the cell, which in roster mode is
  off-screen, so it cannot be the menu's route.
- **Which rows get which item is a pure rule** (`rowMenu.ts`): unread/read needs a TerminalCell
  with a session (a command or launcher cell manages no attention); set aside needs a TerminalCell,
  matching the header, which offers park only there.
- The cell header is unchanged; tiled-mode right-click is out of scope (it would fight xterm's
  copy/paste).
- Menu words go through vue-i18n (new `rowMenu` section); the existing up/down labels move with them.

## Out of scope

Sound and Web Push are not replayed. "Mark read" is offered because it is the same menu slot, not
as a separate feature.
