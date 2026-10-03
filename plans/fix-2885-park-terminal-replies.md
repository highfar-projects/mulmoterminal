# fix: a parked cell is woken by xterm's replies to tmux's attach-time queries (#2885)

tmux queries every client that attaches (DA1, DA2, OSC 10/11). A cell whose PTY was reaped after
`REAP_GRACE_MS` reconnects as a new client, xterm.js answers on the input channel, and
`isTypedInput()` counted the answers as typing, so the cell woke with nobody at the keyboard.

- `isTypedInput()` now also excludes what `common/terminalReplies.ts`'s `scanForUserInput()` calls
  an emulator reply — the classifier the server already uses for the same problem (#1693). The
  local focus-report list goes, since the scanner covers it.
- Only a FINISHED reply is excluded. The scanner holds an unfinished tail for a socket that may
  split it; xterm.js writes each reply in one `onData`, so in the browser that tail is a whole key
  (Alt+[ is `ESC[`) and stays typing.
- Same predicate gates `guardBufferHealth` and the dropped-input report; a reply is not a keystroke
  for those either.
- Known overlap, shared with the server: Shift+F3 is `ESC[1;2R`, the shape of a cursor position
  report, so it does not wake a parked cell.
