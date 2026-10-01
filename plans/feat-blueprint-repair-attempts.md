# A step whose check keeps failing gets repair attempts before a person is asked (#2811)

A build retried a failed check three times, each time with only the last output, and then stopped for a person —
who, as in the reported case, may not be able to fix it either. Doing the same thing again with the same
information is what repeats a failure.

- `MAX_FAILED_CHECKS` goes from 3 to 5, and `REPAIR_AFTER = 3`: once three attempts in a row have failed, each further
  attempt is a repair.
- The run keeps what every failed check printed since the step last started afresh (`failureOutputs`, capped at the
  limit), cleared when a person retries and when the check passes (a repeating step's next round therefore starts
  clean too).
- The prompt shows the earlier failures, oldest first (each trimmed to `EARLIER_FAILURE_PROMPT_CHARS`), and a repair
  attempt is told that doing what they did again will not pass either: read the check, work out why every attempt
  still failed by comparing what each reported, then fix that cause. With #2812 the prompt also names the check.

Session-lost attempts and notices already count as failed checks, so they get the same history and repairs. Notices
that only a person can resolve (untrusted, folder-busy, answers-unwritten) still stop at once; the next change makes
the ones a machine can resolve recover by themselves.
