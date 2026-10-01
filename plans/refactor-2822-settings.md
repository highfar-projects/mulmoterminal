# refactor: settings cluster of the jscpd backlog (#2822)

The Settings editors carried the same few lines in several components. This removes the settings
cluster of the duplication scan by extraction, with no change in behaviour.

## What is extracted

- **`src/composables/useEntryListEditor.ts`** — the `saving` / `refused` / `serverProblem` state and
  the `apply` / `remove` pair that `AccountsEditor`, `CustomAgentsEditor` and `ProvidersEditor` each
  wrote out. It is generic over the problem word, so Providers keeps `ProviderProblem` and the other
  two keep `EntryProblem`.
- **`src/composables/entryChangeOutcome.ts`** — the one decision inside `apply`: what a change's
  answer leaves on screen (a bare refusal vs. a problem word). Pure, so it is tested by every answer
  shape rather than through a mounted editor.
- **`src/components/settings/dirFormContracts.ts`** — the props/emits contract a directory-form field
  (`DirIconField`, `DirBackgroundField`) and a directory-form section (`DirListsSection`,
  `DirMediaSection`) are held to by `DirMediaSection` / `DirSettingsForm`. Types only.
- **`src/components/settings/useDirFormKeys.ts`** — `values` / `isSet` / `isLocal` read off a section's
  `detail`, which both sections declared identically.

## Why it preserves behaviour

- The old `apply`/`remove` were copied verbatim into a throwaway harness and run beside the composable
  over generated scripts of add/remove calls (including a remove asked for while a change is out),
  comparing the whole state trace and what was sent. A deliberately broken `entryChangeOutcome` was
  caught by the same harness.
- The old `values`/`isSet`/`isLocal` closures ran beside `useDirFormKeys` over generated details,
  before and after a redraw hands a new detail.
- Each touched SFC was compiled with `@vue/compiler-sfc` before and after, and the runtime `props`
  and `emits` it generates were compared. `DirListsSection` writes `{ path: string } & DirSectionProps`
  so the generated prop order is unchanged too.
- The generator and property of each harness live on in `test/src/composables/useEntryListEditor.spec.ts`
  and `test/src/components/settings/useDirFormKeys.spec.ts`.

## Declined

Nothing in this cluster was declined.
