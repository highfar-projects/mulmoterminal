# feat: command palette — open a new terminal in a recent directory (#2484)

Step 5 (first part) of the order agreed on #2411.

## Decisions

- **Rows.** The launch panel's directories become rows: the workspace, then the recent directories (`launchChips`), each labelled "New terminal: <dir>" (home-relative).
- **Where the list comes from.** The grid provides it (`PaletteTerminals.launchDirs`). `useAppConfig()` makes `presets` and `defaultCwd` per call, so only the grid, which loaded them, holds the real list.
- **Starting.** A pick calls the existing `openTerminalAt(path, <acting terminal's slot>, agent)`, placing the new terminal beside the one commands act on.
  - The agent comes from `launchAgentPick()`, the one sanctioned reader of the default-agent setting; it follows the value when it arrives late.
  - A custom default falls back to Claude, since `openTerminalAt` takes built-in agents only.

## Next

Launchers, resuming a past session, and choosing another agent. They need a new entry point into the grid.
