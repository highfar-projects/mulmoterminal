# feat: experimental GitHub board (#3172)

A page at `/github/board` that answers, per piece of work: which issue, which PR, where it is being
worked on, and how far along it is. Read only. `/github` itself only gains a link to it.

## Data (server, `GET /api/github/board`)

Per configured repo (`getPrRepos()`, GitHub only — a GitLab repo answers with a per-repo error):

- `gh pr list --state open` with `headRefName`, `headRefOid`, `closingIssuesReferences`, `reviews`
  on top of the fields `/api/prs` already reads.
- `gh pr list --state merged --limit <small>` for the merged column.
- `gh issue list --state open`.

Live cells: every live PTY's `cwd` → `currentBranch` + `repoForDir`, so a cell is placed on the card
whose `(repo, branch)` it is on, with its `working` / `waiting` from the activity map.

## Rules (pure, `server/git/board.ts`)

- A PR's issue: `closingIssuesReferences` in the same repo; failing that, the branch name's issue
  number (`issueCandidateFromBranch`), accepted only when that issue is in the repo's open list —
  the confirmation the candidate needs.
- Columns:
  - **todo**: an open issue no PR or cell claims.
  - **implementing**: a cell on a non-default branch with no PR; draft; CI failing; changes requested.
  - **review**: open PR whose CI is still running, or whose head commit has no review yet.
  - **qa**: CI green or absent, no changes requested, and the head commit reviewed (or approved).
  - **merged**: recently merged.
- Review round = distinct commits that received a review. A proxy: it counts bot and human reviews
  per push, and does not see a codex cross-review posted as a plain comment.

## UI

`GithubBoard.vue` in its own overlay on route `githubBoard`, five columns, one card per item. A cell
chip on a card jumps to that cell in the grid through `gridSessionJump`, which the grid registers
while it is mounted; a cell the grid does not hold is shown disabled.

## Out of scope

Recording review rounds properly, and sending instructions to a cell from a card (needs an HTTP
entry point with a same-origin guard).
