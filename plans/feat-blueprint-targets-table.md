# feat: the run view shows the work list (`targets.json`) as a table (#2851)

## Problem

The refactor pack's survey writes `.blueprint/targets.json` and each round of the repeating step
updates it. The run view never shows it, so which target is in progress, which are done and which
one is waiting for a decision can only be learned by opening a hidden file or reading the terminal.

## Shape

- **Generic, not refactor-only.** Any pack whose steps write `.blueprint/targets.json` gets the
  table. The file's shape is already pinned by `blueprints/refactor/checks/targets.mjs`; the display
  reads it leniently (unknown fields dropped, a malformed file reported, never thrown).
- **The shared shape lives in `common/blueprint/targets.ts`**: the response the route sends and the
  client parses, plus the pure rule that turns targets + run state into rows.
- **Which target is being worked on is derived, not stored.** A repeating step works one target per
  round, the first still `todo`. So when the current step declares `repeatWhile`, that target is
  "in progress" while the step runs and "needs a decision" while it awaits an answer. Any other step
  marks nothing — the survey writing the file is not working on its first target.
- `GET /api/blueprints/runs/:id/targets` reads the file through `projectFiles`, like the report and
  the spec. The view reloads it whenever a step's status or round changes, which is when the file
  is rewritten.

## UI

`BlueprintTargets.vue`, in the run view above the step list: one row per target (order, title, kind,
status), a row opens its detail (why, proof, files, pull request, note), and the row waiting for a
decision is tinted. A pull request link is shown only for a GitHub pull-request URL.
