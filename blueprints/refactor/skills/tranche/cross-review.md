# Codex cross-review of one pull request

A second reviewer, when one is available. Codex reads the pull request and posts findings; you judge
each one with the full context, fix what is real, and ask again. The change merges only when Codex
has nothing left above a note on the head that will merge, **and** CI is green.

This is the method of the `codex-cross-review` skill, cut down to one pull request inside a build.

## Is Codex available?

`command -v codex`. If it is missing, or the probe below cannot run the tests, say so in the pull
request ("no Codex review: <why>") and in the target's `review` field, and merge on CI alone. A
review that could not run is recorded as not having run — never as clean.

## Probe the sandbox once, before the first round

A reviewer that cannot run something reports no findings, and that looks exactly like a clean
review. So first, in the repository:

```bash
codex exec --sandbox workspace-write -c 'sandbox_workspace_write.network_access=true' \
  "Do not review anything. Run these and report each EXIT CODE: 1. <every gate from .blueprint/gates.json>
   2. curl -sS -o /dev/null -w '%{http_code}' https://api.github.com
   Then say in one line each: which gates you could run, whether you reached api.github.com,
   and whether file deletions are permitted (touch /tmp/x && rm -f /tmp/x)." < /dev/null
```

- **Every** call in the loop carries `--sandbox workspace-write -c 'sandbox_workspace_write.network_access=true'`,
  `< /dev/null` (or it waits on stdin forever), and runs under `timeout 2400`.
- If the configured model is refused ("requires a newer version of Codex"), pass `--model` explicitly.
- If deletions are refused, tell Codex not to run a mutation sweep — its restore would fail and every
  later count would measure the harness. Offer to run any mutation it names.

## Each round

1. **Ask for everything at once.** A finding held back costs a whole extra round, because a fix is
   first reviewed in the round after it is pushed. The prompt says so, and asks for every finding with:
   severity (P1 blocker / P2 should fix / P3 nit / N prose-only note), every other site of the same
   mistake, the smallest change that resolves it, and what would change the reviewer's mind.
2. **Name the axes and require an answer on each**, "none" included: correctness and edge cases,
   security, whether a test goes red if the new behaviour breaks, API / wire compatibility, consistency
   with the codebase — and, for a refactor, **the behaviour-preservation proof**. A refactor is always
   treated as the deep kind of review, because "it behaves the same" is exactly what a quiet round misses.
3. **Carry a compact ledger** of findings already settled — one line each, with the reason — so the
   next round does not re-argue them. A rejected finding keeps its evidence in full.
4. **End with one comment** that starts `CODEX VERDICT: LGTM` or `CODEX VERDICT: CHANGES REQUESTED`,
   then the axis table, then `FINDINGS COMPLETE: I read every hunk of the diff and this is every finding I have.`
   An LGTM without that last line is not clean: ask which parts it did not reach.

## Judging the findings

- **Reproduce before accepting**: apply the change a finding describes and watch the gates. Reasoning
  about why it is safe is the step that fails.
- **Fix the class, not the site.** Search for the same pattern and fix every occurrence in this round;
  each surviving copy is otherwise its own finding in its own round.
- **Settle disagreements inside the round.** For each finding you decline, put your reasoning back to
  Codex in one follow-up call before pushing ("ACCEPTED or DISPUTED, with evidence"). A rebuttal left
  for the next round costs that round.
- **The third finding on one symbol stops the case-by-case fixing.** Re-state the rule as what is
  permitted and report everything else, then ask Codex for a form that still gets past it.
- **One batch, one push.** Every accepted fix from the round goes in together.
- Post each round's exchange to the pull request as **one** comment — the prompt and Codex's reply
  verbatim — so the reasoning outlives the terminal. One comment per round, not per call.

## When it ends

- **One clean round on a head nothing was pushed to**: Codex LGTM with FINDINGS COMPLETE, and your own
  reading of the same head finds nothing to fix. A round in which you pushed a fix always owes another.
- Dispatch each round the moment you push; do not wait for CI. CI still gates the merge.
- There is no round cap. Stop and ask the person only for a decision that is theirs: a behaviour choice,
  a finding that says the change should not exist, or Codex failing in a way a retry does not fix.
- Record the outcome in the target's `review` field: `codex: clean after <n> rounds`, or why there was none.
