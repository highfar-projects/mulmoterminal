# feat: cell chrome that fits each zoomed layout

From the #2311 inventory, decided one item at a time with the user (items 1, 2 and 4):

1. **Roster: no left/right arrows on the enlarged cell.** The roster's rows reorder by drag and ⋮,
   and the arrows pointed across a list that runs top to bottom. `TerminalGrid` tells every cell it
   cannot reorder while `zoomed && listMode`; the filmstrip and the tiled grid keep the arrows (in
   the filmstrip they are the only way to reorder, and the strip runs left to right).
2. **Filmstrip thumbnails: directory and close only, whatever the cell runs.** At 260px the header
   buttons were cut off, and a thumbnail enlarges on a click anyway. `CellChromeButtons` takes
   `closeOnly`; a session thumbnail uses it, and `CellShell` (command / launcher cells) now has a
   thumbnail form too: no arrows, no actions, no program name (its icon stays), and the terminal's
   own header row hidden, as a session thumbnail already did. The one predicate is `isThumbnail`
   in `gridCell.ts`.
4. **The roster/strip switch shows only on the grid.** It stayed under overlays and flipped a
   layout nobody could see; it now goes with the grid's own controls.

Item 3 (restoring from the roster by re-clicking the enlarged row) was decided against.
