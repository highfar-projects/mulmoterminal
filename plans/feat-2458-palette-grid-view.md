# feat: command palette — switch the grid's view and cell order (#2458)

Step 1 of the order agreed on #2411.

## Decisions

- **Registration.** The grid registers its view settings with `usePaletteGridView`: the roster/strip toggle and the cell order. This mirrors the terminal registration. GridView gains one call.
- **Rows.** `paletteChoices` adds, only while a grid is mounted:
  - two view rows (Roster, Thumbnail strip) and three order rows, with the sort menu's own names and icons.
  - The ones in effect say "Current".
- **Applying.** The view switch underneath is a toggle, so a view pick applies only when it differs from what is shown. An order pick calls the toolbar menu's `chooseSortMode`.
