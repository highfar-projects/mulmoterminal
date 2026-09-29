# feat: command palette — start an agent or a launcher here (#2487)

Part of #2411, step 5 (second part). Step 5a (#2484, #2485) listed "New terminal: <dir>".

## What

The palette lists, for the directory of the terminal commands act on (else the workspace):

- "Start <agent> here" for each Agent Picker option: the built-ins, the user's `customAgents`, Shell.
- "Launch: <label>" for each configured `launchers` entry.

Picking one places the cell next to the acting terminal, as the launch panel would have built it.

## Shape

- `useNewTerminal`: `NewTerminalRequest` gains an optional ready-made `cell`; `openCellAt(cell, afterSlotKey)`
  delivers it through the same queue and route switch as `openTerminalAt`. GridView places
  `request.cell ?? cellForAgent(cwd, agent)`.
- `paletteStarts.ts` (pure): the options (`agentPickerOptions` order, then launchers by allowlist
  index) and the cell for each (`cellForPanelStart` with no model/account choice; the launcher cell
  the panel's chip builds).
- `PaletteTerminals.startDir()`: the acting cell's cwd, else `defaultCwd`, else null — null lists no
  starts, since an autoStart cell with no directory never starts.
- Rows: kind `start`, key `start:agent:<pick>` / `start:launcher:<index>`, found by `>`, disabled
  with the grid-full reason like the 5a rows.

## Not here

- Model / account choice (the panel's form); the palette starts with the defaults.
- Resuming a past session (5c).
