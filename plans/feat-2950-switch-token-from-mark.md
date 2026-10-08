# feat: move a rotated cell to another subscription from its account mark (#2950)

Stacked on #2949 (the mark must survive a reload to be clickable there).

## What the user asked for

Click the cell's account mark, pick another subscription, and have that session restart on it.

## Decisions

- Rotated plain claude cells only, the set the mark already appears on. Choices are the `tokenRotation`
  tokens, plus the `/login` credential when `includeDefaultLogin` is on. Accounts (separate homes) are
  out: they are a different home, so the conversation does not carry over.
- The restart is the existing reap-then-reconnect. The new route (`POST /api/session/:id/switch-token`)
  pins the pick, then ends the session as the close button does and answers `ended`, which the client
  reconnects on. The pick is consumed by the next spawn of that session and expires, so a reconnect
  that never comes cannot colour a later restart.
- A session with no transcript is handed a new id on reconnect; the pin follows it.
- The rules (what may be picked, what a pin does) are pure and in their own files; the route and the
  spawn only call them.
- The `credential` frame carries the token id so the menu can show the current one.

## Not done

- No confirmation before restarting, as with Restart the agent: the pick is the deliberate act.
- The "moved off" terminal line is keyed by the old id, so a session that is handed a new id does not
  print it.
