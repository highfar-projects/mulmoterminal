# refactor: lift the Files pane's row menu into its own composable

## Why now

`FilesPane.vue` counts one line under the repo's `max-lines` cap. The two changes queued behind
this one — the tree cache (#2148 stage 2) and the remembered scroll/cursor positions (#2149) — both
add to it, so something has to come out first. This is that, and nothing else: no behaviour change
is intended.

## Why the row menu, and not the other candidates

| candidate | lines | why not |
|---|---|---|
| external-change watcher (`checkForExternalChange`, `watchExternalChanges`, `onPageHide`) | ~45 | reads six of the pane's refs; lifting it turns them into parameters and buys no testability |
| conflict banner (markup + `overwrite` / `discardAndReload`) | ~50 | the markup moves but the state stays, so the two ends drift |
| **row menu** | **~90 script** | self-contained state machine, and `filesRowMenu.spec.ts` already drives it END TO END through the pane — so the lift can be **proved** rather than argued |

## The shape

A composable, not a component: the `<Teleport>` markup stays in `FilesPane.vue`, so **what renders
does not move at all** and the DOM is identical by construction. What moves is the imperative half
— the open state, viewport-clamped positioning, the window listeners, focus capture and return,
and the arrow-key navigation.

```ts
useFilesRowMenu({
  menuEl,                                  // the pane's template ref
  actionsFor: (node) => FilesRowAction[],  // stays in the pane: it reads props + storiesRoots
  run: (action) => void,                   // stays in the pane: it emits
});
// → { menu, openFor, close, onMenuNav, onRowKeydown }
```

Keeping `actionsFor` and `run` in the pane is deliberate. They are the two ends that touch `props`
and `emit`, and a composable that took those would need the whole prop surface passed through it.

## How behaviour preservation was proved, not argued

1. **`filesRowMenu.spec.ts` runs unchanged**, along with every other Files-pane spec. Ten cases go
   through the pane: both entrances (right-click, `ContextMenu` and `Shift+F10`), the
   relative/absolute insert pair, the Canvas entry and its absence, the no-terminal case, keyboard
   navigation end to end, focus returning on dismiss, and focus NOT returning after an insert. The
   spec never names the composable, so the lift cannot satisfy it by construction.
2. **A DOM differential, run before the lift and again after it.** A throwaway harness mounted the
   pane and opened the menu at a grid of pointer positions — the corners, points outside the
   viewport, and the middle — for both mounts of the pane (beside a cell with a terminal and a
   Canvas; full-screen with neither), on a file row and a directory row, through both entrances;
   then picked every action in turn. It recorded the menu's rendered markup, its computed
   `top`/`left`, which element held focus, and what the pane emitted. **The two captures compare
   byte-identical.** The harness is deleted — half of it was the code it was comparing against.
3. **What survives it**, per `/refactor-safely`: the generator and the property became
   `test/src/composables/useFilesRowMenu.spec.ts`. `menuPosition` is pure and had no direct test;
   it now has one that opens from the corners and from far outside the viewport and asserts the
   panel stays inside, that it sits exactly under the pointer while there is room, and that a taller
   menu starts higher. Written with no magic numbers — the bounds are read back from the function,
   so moving the margin is not a failure but breaking the clamp is.

## What this does NOT do

No behaviour change, no new state, no prop or emit added or removed. If the diff contains one, it
is a defect in the lift.
