# feat: board card detail panel (#3177)

Second step of the experimental board (#3172). Pressing a card opens a panel beside the columns; the
card itself no longer links to GitHub.

## Data (server, `GET /api/github/board/detail?repo=&issue=&pr=`)

- `parseBoardDetailQuery` (pure, `server/git/board-detail.ts`): `repo` must be a repo entry; `issue`
  and `pr` are optional, but at least one is required, and each must be a positive integer written in
  digits. Anything else is a 400.
- `boardDetail` (`server/git/board-fetch.ts`): the repo must match a configured `prRepos` entry by
  `repoIdentity` and be on GitHub, else 404. It runs `gh issue view` and `gh pr view` in parallel; one
  failing is reported in `errors`, and the other part is still returned.
- `parseIssueDetail` / `parsePrDetail` (pure): author login, label names, body, `+/-` counts, each
  check with its own state (the list's `rollupCiState` applied to one check; CheckRun `name` /
  `detailsUrl` and StatusContext `context` / `targetUrl`), and each review (author, state, short commit).

## UI

- `GithubBoardCard.vue`: the issue / PR / branch block is one button that toggles the panel; no links.
- `GithubBoardCells.vue`: the cell list, shared by the card and the panel.
- `GithubBoardDetail.vue`: fetched when the selected card changes (not on every board refresh). The
  issue and PR bodies go through `MarkdownProse` with `images-as-links`, the renderer for markdown a
  stranger wrote. A card with neither an issue nor a PR shows its cells and asks GitHub nothing.
- The selection is module state (`boardSelection`), so the overlay's Escape closes the panel before the
  board. A selection whose card is gone after a refresh is dropped.

## Out of scope (next steps on the issue)

Starting a session from a todo card (issue text sent automatically), refreshing the board on its own,
and highlighting a card whose cell waits for input.
