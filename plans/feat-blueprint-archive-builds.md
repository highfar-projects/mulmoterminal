# feat: put a build away from the list (#2610)

The build list only grows. Finished builds, and builds started as a trial and left waiting for
approval, bury the ones a person is working on. Deleting a record cannot be undone, so this adds a
reversible "put away" instead.

## Behaviour

- The run view has a button: 「一覧からしまう」 / 「一覧に戻す」.
- A put-away build is listed last, inside a closed `<details>` headed 「しまったビルド（N）」,
  whatever its state — including one waiting for approval. It opens by itself when the selected
  build is inside it.
- While an agent works on the build (a step session, or the spec being rewritten) it cannot be put
  away: the button is disabled with the reason, and the server refuses with the existing
  `agent-working` refusal. Bringing it back is always allowed.
- Nothing is deleted: neither the record under `~/.mulmoterminal/blueprints/runs/` nor the project
  folder. The steps and the answers are untouched.

## Design

- `BlueprintRun.archivedAtMs: number | null` (default `null`, so records written before it read as
  listed). The summary carries `archived: boolean`.
- `executor.archive(runId, archived)` runs inside the run's serial queue and is wrapped by the
  ownership lock like every other mutation.
- `POST /api/blueprints/runs/:id/archive` with `{ archived: boolean }`.
- The list item moved into `BlueprintRunItem.vue` so the archived group can render the same item
  inside its `<details>`.
- The archive error is shown next to the button, not with the step's errors: a finished build has
  no step section to show them in.
