# A step whose check fails can tell its agent how to fix it (#2811)

A person reported a build stopped at 「アクションを機能にする」 with only the check's English output and a retry
button; a non-engineer cannot fix that. The build retries a failed check up to three times with the output, so the
agent needs to be able to tell from that output — or from the check — what would satisfy it.

- The retry prompt (`stepPrompt`'s failure section) names the step's check with the pack folders written in
  (`resolvedCheck`), and tells the agent to read it when the output does not make plain what would satisfy it, and
  never to change the check or the packs. Reading has no side effects; running some checks has (polish's progress
  records a count), so the agent is not told to run it.
- The actions check (`from-collection/checks/actions.sh`) lists the test titles it read and the rule it reads them by
  (only the title of an `it` / `test` imported from vitest; a `describe` name does not count) when a feature has no
  test. The four actions skills name the describe pitfall.

A reproduction (a small project with the tests split into describe / it, the actions decided as features) failed
the check with exactly the reported lines; Claude Code given the new retry prompt fixed it in one attempt and the
check passed. With the old prompt and skills it also fixed it in that reproduction, so the reported build's three
failures had another cause; this change is hardening, and the next change keeps a build from stopping after three.
