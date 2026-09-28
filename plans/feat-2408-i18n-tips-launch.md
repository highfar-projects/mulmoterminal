# feat: translate the launch form's tooltips and aria-labels (#2408, part 2 of 4)

Part 2 of #2408 (part 1: `plans/feat-2408-i18n-tips-cell.md`). The launch form — the empty
cell's directory chips, agent picker, worktree rows and resumable sessions — showed English tips
and read English aria-labels in every UI language.

## Change

- `src/i18n/tips/*.ts`: a `tips.launch` section in all five bundles.
- `CellLaunchForm.vue` and `ChatModalAgentPicker.vue` take every tip and aria-label from it. The
  chip's hover and spoken name, the worktree rows' three states and the MCP group rows become one
  message each with named placeholders; the chip's spoken name appends whole sentences, never
  fragments.
- `agentPicker.ts` has no i18n instance, so an option's hover is now a `tip` — a message key plus
  the custom agent's `command` — instead of an English `title`.
- The "this worktree is taken" sentence is said in the UI's language here; `worktreeLimitReason`
  in `common/` keeps the English copy the server returns. The same sentence also shows under the
  directory field, so that notice is translated with it.
- `test/src/components/tipCensus.ts`: part 1's census, shared by both surfaces, plus a check that
  every locale keeps each message's placeholders.

## Not translated

Paths, chip and launcher labels from config, session titles, the account label, an MCP write's
error text (from the server), agent names.

## Deliberately left for later

Visible text in the form ("WORKING DIRECTORY", "failed", "● open", the `window.confirm` before
removing a dirty worktree) — #2408 is about tips and aria-labels. `LaunchAgentPicker` and
`LauncherButton` take their words from their callers, which are parts 3 and 4.
