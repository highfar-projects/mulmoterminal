# feat: the board counts codex cross-review verdicts (#3196)

Sixth step of the experimental board (#3172): the "record review rounds properly" item it left out.

## Why a new signal

The card's review round counts commits that got a GitHub review. A codex cross-review round is a
plain comment whose first line is `CODEX VERDICT: LGTM` or `CODEX VERDICT: CHANGES REQUESTED`, so it
was never counted.

## Which head a verdict was for

Time cannot say. On #3191 head `e1f77995f` was pushed at 04:52 and an LGTM posted at 04:55 was for
the previous head. So the verdict line names its head — `CODEX VERDICT: LGTM (head <sha>)` — and the
codex-cross-review skill (outside this repo) now writes it. A verdict is `current` only when its sha
is a prefix of the PR's `headRefOid`, `stale` when it names another commit, `unknown` when it names
none (every verdict posted before the skill changed).

## Rules (pure, `server/git/codexVerdict.ts`)

- A verdict is a body OPENING with `CODEX VERDICT: LGTM` / `CHANGES REQUESTED`; what follows is not
  anchored, because several real verdicts were posted with a typed backslash-n after the word.
- Read top-level comments (`createdAt`) and review bodies (`submittedAt`) from the same `gh pr list`
  call. Only the OPEN list gains the `comments` field: on a PR that went through a review loop the
  comments are most of the payload, and the merged list is where most such PRs are, while a verdict
  on a merged PR no longer decides anything. So a merged card shows no codex chip.
- Count only `OWNER`, `MEMBER`, `COLLABORATOR` — anyone can comment on a public repo.
- The newest verdict is the one with the latest time; one with no time (a review saved but not
  submitted) is not a verdict. `gh pr list` returns a PR's first 100 comments and first 100 reviews,
  so a list at either cap is flagged `more` and shown as `N+`.

## UI

A chip beside the review round: `Codex 3: LGTM`, green / red only when the verdict is for the
current head; otherwise muted, with "for an older push" or "push not named" beside it. Columns do not change.
