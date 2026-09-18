# feat(keymap): `focus-prev` / `focus-next` — walk the cursor across the tiled grid (#2106)

## What this adds

Two keymap actions that move the **keyboard focus** one cell along the on-screen order while the
grid is **not** zoomed — the un-zoomed counterpart of `zoom-prev` / `zoom-next`, which move the
enlargement. Today the only way to reach a neighbouring cell in the tiled grid is the mouse:
`zoom-prev` / `zoom-next` decline the key with nothing enlarged, and `next-attention` is a
"go to whoever called" key that ranks by attention and skips cells mid-turn.

## The decision that shapes everything else: no state-dependent dispatch

The issue floats binding ONE key to both pairs and picking the action by zoom state. We are
deliberately **not** doing that.

`actionForKey` (`common/keymap.ts`) returns the lowest-ranked bound action and stops, and the
collision reporting in `validateKeymap` is built on top of that: `fallthroughWinner` states that
only a `send` can be the claim that fires when a conditional action stands aside, and
`test/common/keymapSend.spec.ts` pins it. Making one keystroke resolve to a different action per
state means turning that resolver into "ordered candidates + the first whose precondition holds",
then teaching the collision reporter about action→action fall-through and the three-way case
(`zoom-prev` + `focus-prev` + `send` on one key), where the current model assumes exactly two
reachable claims. That is a change to a shared module with its own invariants — independently
revertable, so a separate PR if it is ever wanted.

So: **one action, one meaning, and it declines in the state where it has none.** That is already
how `zoom-prev` behaves (it declines un-zoomed); `focus-prev` is the mirror.

Consequence to state plainly: binding the same key to `zoom-prev` AND `focus-prev` still resolves
to a single action — `zoom-prev`, because it ranks earlier — and `validateKeymap` warns that
`focus-prev` never fires. That is honest and unchanged behaviour, not a regression.

## Semantics

- **Origin** is the focused cell (`focusedCellUid` in `GridView.vue`). That is not new state:
  ZOOM INVARIANT 4 in `gridTabs.ts` already declares "the enlarged cell while zoomed, the focused
  cell otherwise", and `zoom-toggle` / `next-attention` already read it.
- **Step** is ±1 along the whole ordered list, so a step past the page edge brings the
  neighbouring page on screen — the same thing `next-attention` does un-zoomed. This answers the
  issue's open "wrap at the page edge or step to the next page".
- **Ends** stop rather than wrap, matching `moveZoom`. A walk with ends reads differently from a
  key that stopped responding.
- **Empty launch cells are skipped**, for the reason `nextCandidate` skips them: a launch form has
  no terminal, `conn.focus` on it is a no-op, and the key would read as dead.
- **With no origin** (nothing focused yet, or the focused cell has closed) the first terminal on
  the page being looked at IS the target rather than the origin — someone with no position wants
  one, and stepping past it would skip the cell they are looking at.
- **While a cell is enlarged the key is declined**, not swallowed: the handler returns without
  stopping the event, so a `send` on the same keystroke still fires. Same mechanism as
  `NEEDS_A_CURRENT_TERMINAL`, mirrored.

Nothing new is needed for the issue's "visible marker": `TerminalGrid.vue` already lifts the
focused cell (`cellClass`'s `focused`, un-zoomed only).

## Changes

- `common/keymap.ts` — `focus-next` / `focus-prev` in `KEYMAP_ACTIONS`; a new
  `NEEDS_NOTHING_ENLARGED` list as the mirror of `NEEDS_A_CURRENT_TERMINAL`; `standsAside` learns
  it so the collision reporting stays honest in both directions.
- `src/composables/gridShortcut.ts` — check both lists.
- `src/components/gridTabs.ts` — `moveFocusUid` / `moveFocus`, the pair shaped like
  `nextAttentionUid` / `nextAttention`. `moveFocus` reuses `revealCell` for the page. Both refuse
  while zoomed, holding ZOOM INVARIANT 3 (`page` is not maintained while a cell is enlarged) where
  the arithmetic is, rather than relying on the caller's guard alone.
- `src/components/GridView.vue` — one branch in `runShortcut`, delegating to a small
  `moveGridFocus` so the dispatcher stays readable. Plus `switchTo`, which is where the
  review found the one real defect: a page-tab click leaves no cell holding the cursor, and
  the retained `focusedCellUid` went on naming a terminal nobody could see, so the walk went
  straight back to the page just left. The condition is what is VISIBLE after the switch, not
  that a tab was clicked — `switchPage` returns the state unchanged for the page already
  shown, where nothing unmounts and the selection is still in front of the user. This is a
  behaviour change to `zoom-toggle`, `next-attention` and `terminal-new-here` as well, since
  all three read that value, and it is the right one: INVARIANT 4 makes the focused cell the
  un-zoomed selection, and a selection off-screen is not one.
- `src/components/keymapLabels.ts` + `src/i18n/{en,ja}.ts` — the Settings rows.
- Docs: `server/skills/mulmoterminal-keys/SKILL.md` (the skill that OWNS keymap), and
  `docs/guide/{en,ja}/config.md`.

## Tests

- `gridTabs.spec.ts` — steps, stops at both ends, skips launch cells, page follows across the
  edge, null origin lands on the first terminal of the current page, refuses while zoomed.
- `gridShortcut.spec.ts` — accepted un-zoomed, declined zoomed (the mirror of the existing
  `NEEDS_A_CURRENT_TERMINAL` cases).
- `keymapSend.spec.ts` — `focus-*` stands aside while enlarged so a same-key `send` is named as
  the other-state winner; and `zoom-prev` + `focus-prev` on one key reports a single winner,
  pinning the decision above.
- `GridView.spec.ts` — the key moves the cursor to the neighbouring cell; the walk does not
  go back to the page just left after a hand page switch; and the selection SURVIVES a click
  on the tab already shown, which is the half that a page-number comparison would get wrong.

## Verification

The grid's key handler is a wide blast radius (every keystroke the grid can hear passes through
it), so beyond the suite this is driven in a real browser: bind the two actions, walk the cursor
across a multi-page grid in the tiled view, confirm the page follows and the lift lands on the
target, and confirm the key does nothing while a cell is enlarged.
