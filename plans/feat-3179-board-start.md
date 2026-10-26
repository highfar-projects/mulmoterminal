# feat: start a todo card's issue from the board (#3179)

Third step of the experimental board (#3172, #3177). A To do card gets the `/github` issue row's start
button. From the board it sends the issue text at once and keeps the board on screen.

## Decisions

- **The issue text is sent automatically from the board.** Chosen by the maintainer on #3177. The
  `/github` rows keep the draft, for the reason the route already gives: whoever wrote the issue is
  often not the person running it.
- **No second start mechanism.** The board reuses `IssueStartButton` / `useIssueStart` /
  `POST /api/issues/start`, so the clone choice, the remembered clone, the agent picker and every
  refusal (busy worktree, unavailable agent) behave as on `/github`.

## Changes

- `POST /api/issues/start` takes an optional boolean `run`, passed to `spawnIssueSession`. Absent or
  false is today's behaviour; a non-boolean is a 400, rejected before anything is started.
- `useIssueStart.startIssueWork(repo, issue, dir, options)`, where `options` is
  `{ run?, reveal? }`: `run` goes in the body, and `reveal: false` places the cell with
  `placeSpawnedChat(..., { reveal: false })`, which skips the switch to `/terminals`.
- `IssueStartButton` takes those options and emits `started`.
- The board shows the agent picker row and the start error as `/github` does. It loads the repo
  clones when it mounts, and reloads itself after a start, so the card moves to Implementing with its
  new cell.
- README: the board, its two routes, and the `run` flag. `docs/remote-host-protocol.md`: the desktop
  route now has a `run`, which only the board sends.

## Out of scope

Refreshing the board on its own, and highlighting a card whose cell waits for input.
