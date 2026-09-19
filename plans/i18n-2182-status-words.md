# i18n: the grid and roster status words (#2182)

## Scope

The status words only — the four tables the issue names. They are the highest-traffic strings in
the app because the grid and the roster are open the whole time.

| table | where it is now | what it holds |
|---|---|---|
| `ROSTER_STATUS_KEY` | `attentionStatus.ts` (was `STATUS_WORD` in `CockpitHeader.vue`) | the roster badge's one word |
| `CELL_STATUS_KEY` | `attentionStatus.ts` (was `STATUS_LABEL` in `TerminalCell.vue`) | the cell dot's longer form |
| `WORK_WORD` | `rosterPhase.ts` | what a working row is doing |
| `DISPLAY` | `rosterPhase.ts` | a PR phase, in three registers |

The two `AttentionStatus` tables MOVED, and that was not tidying. Both key off the same enum, and
a table living inside a component is one nothing can test without mounting it — which is how a
typo'd key survived: `status.cell.blockd` typechecks, passed every spec, and would have rendered
on screen. Beside the enum they are ordinary exports with a spec over them. `_KEY` is in the names
because reading one into a template without `t()` renders the key path, and the name should make
that visible.

The header's buttons and chips, and the panes, are the next tranches — the order the issue proposes.
`CollectionChatPane.vue` has a status table too and is deliberately NOT in this PR: its words are a
third, longer register ("waiting on you", "finished, unreviewed") for a pane tooltip, so it belongs
with the panes rather than here.

## The property that must survive

Each table is a `Record<state, …>`, and adding a state to `AttentionStatus`, `WorkPhase` or
`PrPhase` is a COMPILE ERROR until somebody names it. Deriving a key — `status.pr.${phase}.label` —
would delete that and render the key path on screen instead (#1894 says so about `keymapLabels.ts`).

So the keys are spelled out per state and the `Record` types stay. `TerminalCell`'s table was
`as const` rather than `Record<AttentionStatus, string>`; it is typed explicitly now, which is the
same property written down rather than inferred.

## Two decisions the issue left open

**`phaseDisplay()` returns KEYS; it does not take `t`.** It has to stay callable from outside a
component — `tipContent.ts` builds its tooltips there, where `useI18n()` does not exist. Keeping it
a pure lookup means the only thing that changed is what its values are. `workTip` takes a `t`
parameter instead, from its single caller.

**A PR phase's short badge stays in GitHub's vocabulary in every locale; the prose is translated.**
`draft` / `CI fail` / `changes` / `CI…` / `ready` / `merged` / `closed` are the words the PR page
itself uses, the badge is a few characters wide, and matching the badge against GitHub is what the
badge is for. `title` and `state` are sentences and are translated.

`title` and `state` must not collapse into one another — `state` goes where the PR has ALREADY been
named, and using `title` there reads `PR #2689 · PR — CI running` (#1235). Translation is exactly
where that distinction gets lost, since the two English strings look nearly the same, so a test
asserts they differ and that `state` does not re-announce the PR.

## What holds it

A key is a string, so a typo typechecks and renders `status.pr.draft.lable` on screen. Both specs
therefore resolve keys through the REAL English bundle and throw on an unresolvable one, rather
than comparing key text. The `Messages` type already forces the other four locales to have the same
shape.

## Also updated

`settings.language.partial` said only Settings was translated, in all five bundles. It is no longer
true.
