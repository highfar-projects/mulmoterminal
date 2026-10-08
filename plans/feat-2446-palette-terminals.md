# feat: command palette — jump to a terminal by part of its path (#2446)

Step 2 (first half) of #2411.

## Decisions

- **Terminal rows.** The grid's roster (`listRows`) becomes rows through `paletteTerminalOf`.
  - Label: the home-relative path.
  - Line: the memo, else the AI summary, else the agent.
  - The memo and summary are searched too.
  - A cell with no directory yet is not listed.
- **Registration.** The grid registers its terminals with `providePaletteTerminals`, apart from the host that runs actions: a terminal row needs neither the grid in front nor its keyboard.
- **Going to one** (`jumpTo`, pure) mirrors `next-attention`: enlarged → it becomes the enlarged one; otherwise its page comes on screen, and the cursor moves to it.
  - From another screen the grid is brought back first (`usePaletteTerminals`).
- **Order.** Terminals are listed after the actions on the grid, and after the screens elsewhere. Two terminals in one directory stay separate rows (the candidate carries the uid).
- **GridView at its line bound.** `moveGridFocus` moved into `useGridJumps` with the new jump. The two focus-after-tick sites use its `focusSoon`. No behaviour changes.

## Later steps of #2411

Acting on a terminal from its row (the second action panel), and recency ordering.
