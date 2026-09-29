# feat: command palette — open a PR or an Issue (#2517)

Part of #2411, step 6 (content jump), third part.

## What

"PR #12: <title>" / "Issue #34: <title>" for the open PRs and Issues of the repos set for the GitHub
view, with the repo as the detail. Found by title, repo and number; picking one opens it on GitHub in
a new tab, as a row in the GitHub view does.

## Shape

- Offered only where the GitHub view is (the `prs` toolbar gate); the read waits for the gate, which
  can arrive after the palette opens.
- `/api/prs` and `/api/issues` run `gh` once per repo, so the answer is kept for
  `GITHUB_ITEMS_MAX_AGE_MS` and reused across openings. Only a whole answer is kept; a failed read
  lists nothing and is asked again next time.
- `paletteGithubItems.ts` (pure): checks each row off the wire (number, title, url), names a row by
  `repo#number`, and decides freshness (an answer from the future is not fresh).
- Rows: kind `github`, key `github:<repo>#<number>`, octicon per kind.

## A note on `#`

A leading `#` searches file contents (#2512), so a number is typed bare (`12`) or after the repo
(`app#12`). The issue text said `#12`; this is the reason it differs.
