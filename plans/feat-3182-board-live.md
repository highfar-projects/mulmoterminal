# feat: the board follows cell state live and refreshes itself (#3182)

Fourth step of the experimental board (#3172, #3177, #3179).

## Rules (pure, `src/components/boardLive.ts`)

- `boardSessionIds`: every session the board shows, once each.
- `withLiveCells`: a cell's `working` / `waiting` comes from the live feed when the feed has that
  session, otherwise from the last load. The loaded board is not mutated.
- `cardWaiting`: any cell on the card is waiting.
- `finishedTurns`: sessions that were working and now are not, a closed session included. Starting a
  turn, or staying in one, is not a finish.

## Wiring (`src/composables/useGithubBoardLive.ts`)

- `useGridActivity` over the board's session ids, the same seed (`/api/activity`) plus
  `sessions`-channel subscription the grid uses. Nothing new on the server.
- `usePollWhileVisible(load, BOARD_POLL_MS)`: the first read, a read when the tab or window comes
  back, and a slow tick while visible. It replaces the board's own read on mount.
- A finished turn reloads after `BOARD_TURN_RELOAD_DELAY_MS`, debounced, so a push the agent just made
  has time to reach `gh pr list`.
- A failed read keeps the cards on screen and shows the error. Before, it emptied the board, which a
  read every minute would have made visible.

## UI

A waiting card gets an amber border and a "Waiting for you" tag above its title. The selected card's
accent border wins over amber.

## Out of scope

Answering a waiting cell from the board (needs an input route with a same-origin guard).
