# feat: commands in config, and the command palette lists commands and header buttons (#2465)

Step 3 of the order agreed on #2411. Decision B = c: `buttons` also appear in the palette; `commands` appear only there.

## Server

- `commands` is accepted in the global config and in `.mulmoterminal.json`, with the same schema and sanitizer as `buttons`. It has no defaults.
- It is merged by id like buttons. A command whose id any button has, the defaults included, is dropped, because a shell entry is run by its id.
- `resolveHeader` returns `commands` beside `buttons`, resolved the same way (`when`, `${vars}`; a shell `cmd` never reaches the client). `resolveButtonCommand` finds a shell command as it finds a shell button.
- Coverage tables:
  - Settings: owned by the `mulmoterminal-header` skill, which documents it.
  - Worktrees: not inherited, like `buttons`.
  - Directory preview: a "Palette commands" row.

## Client

- `useHeaderButtons` also exposes `commands`.
- Each `Terminal` registers its buttons, its commands and its own `onHeaderButton` under its slot key (`usePaletteHeaderEntries`). A palette pick therefore takes exactly the header's path, and a shell entry becomes a `run` cell.
- The grid tells the palette which terminal commands act on (`currentUid`): the enlarged one, else the one holding the cursor. With none, no command rows are listed.
- The rows are built by `paletteCommandList` (pure): commands first, then header buttons, and a folder's items as "Folder › Item". They sit right after the grid's actions, and `>` finds them with the actions.
