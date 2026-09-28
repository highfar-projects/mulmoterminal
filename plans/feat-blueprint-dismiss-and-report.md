# Polish and write: set a chaff finding aside with a reason, and draft what chaff misread

Issue: #2336

## Why

polish and write pass a file or part only when chaff reports nothing under the house style. Both skills
already told the agent to leave a finding it cannot fix and say so in the report, but the checks failed on any
finding left. An agent following its skill could not finish, and the only way through was to bend the text
until the finding went away. polish promises never to do that, because it must not change what a document says.

## Shape

- `blueprints/docs/checks/dismissals.mjs` (pure): `dismissed: [{ rule, line, because, why }]` on a polish target
  or a write part. `because` is `wrong` (chaff misread the text) or `meaning` (chaff is right, but fixing it would
  change what the document says, such as a quotation of a statute). A dismissal must match a finding chaff reports
  now, so nothing is invented and a stale line is noticed. `withoutDismissed` sets them aside, and `wrongCases`
  turns the `wrong` ones into draft cases.
- `blueprints/docs/checks/drafts.mjs`: the drafting the review pack had (`chaff feedback`, kept under
  `.blueprint/chaff-feedback/`, undone on failure), moved to the base unchanged, plus the report-side check.
  review, polish and write each have a `feedback.mjs` that computes its cases and calls it.
- polish `targets.mjs` and write `parts.mjs` count only the findings not set aside, and refuse a bad dismissal.
- Their reports name the rule of every finding set aside, so the person sees each one. When chaff has
  `feedback`, the reports also name every draft under 「chaff への報告の下書き」.
- The polish and write skills say how and when to set a finding aside, and that it is never a way around the
  work; the report skills say how to hand the drafts over.

## Verification

- `dismissals.spec.ts` covers the pure rules both ways. The polish and write specs cover the checks and the
  drafts through the pack harness. The review specs pass unchanged, which shows the move did not change the
  review pack.
- Mutation sweep over every new decision.
- A real polish run on a notice that quotes a statute inside a long sentence. The agent should shorten the
  ordinary long sentence and set the quotation aside as `meaning`.
