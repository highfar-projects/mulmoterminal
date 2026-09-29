# feat: command palette — resume a past session here (#2498)

Part of #2411, step 5 (third part). Follows #2484 (new terminal in a directory) and #2487 (start an
agent or a launcher here).

## What

"Resume: <title>" for each past conversation of the directory the palette starts things in (the
acting terminal's, else the workspace), resumed in a new cell next to the acting terminal.

## Shape

- History: the default agent's (`launchAgentPick` through `asTerminalAgent`): a custom default or
  Shell reads Claude's.
- `usePaletteResumes`: the launch panel's `useResumableSessions`, read on open and again, from empty,
  whenever the directory or the agent changes.
- `paletteResumes.ts` (pure): drops rows another client holds (`attached`) or the grid already has
  open, by the row's id or its running key; resumes by `runningKey ?? id` in the list's resolved cwd,
  with the row's account. Cell via `cellForPanelResume`, through `openCellAt`.
- `PaletteTerminals.openSessionIds()`: the grid's open session ids.
- Rows: kind `resume`, key `resume:<id>`, found by `>`, disabled when the grid is full.

## Differences from the panel

- A busy row is left out rather than shown disabled. Nothing can be done with it from the palette.
- An open cell is matched by the running key as well as the id, so a codex/agy/muse session already
  open under its minted key is not offered twice.
- The "5m ago" detail uses the same untranslated formatter as the panel's list.
