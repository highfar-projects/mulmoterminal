# The notices a machine can resolve recover by themselves (#2811)

The last part of #2811. #2812 pointed a failing agent at its check, #2813 gave a step repair attempts; this covers the
notices that still stopped for a person although nothing a person did was needed.

- **folder-busy** — a build that found its folder taken by another build stopped and waited for "retry". Now, when a
  build stops working (finishes, or waits for a person), every build waiting on that folder is retried, one after
  another under the folder lock (`wakeBuildsWaitingOn`), so the first takes the folder and the rest find it busy again
  and keep waiting. `recover()` does the same on startup for builds left waiting (`waitsOnBusyFolder` in the policy).
  The notice says it resumes by itself.
- **answers-unwritten** — failing to write `.blueprint/answers.json` is recorded as an ordinary failed attempt
  (`recordNotice`), so it is retried automatically up to the limit instead of stopping at once.
- **untrusted** stays a stop: only a person can answer Claude Code's trust prompt, and the notice already says where.
- When a step does stop after using up its attempts, the run page says so — how many times it tried and that "retry"
  sends it back to repairing (`gaveUpAfter`, `run.gaveUp`) — instead of showing a bare check output.

Waking errors are swallowed: a waiting build that cannot be retried stays as it was, which is what it was before.
