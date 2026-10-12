# feat: MCP tools that drive the right pane for checking work together (#3022)

## Decisions (user's)

- Two host tools in the `render` group: `showInPane` and `requestCheck`. They act on the right pane of
  the cell that called them.
- `requestCheck` returns at once. When the human has answered every item, the result is typed into
  that cell's terminal as one submitted message, as the form tool's answer is (option A).
- A cell that is not enlarged follows the Canvas auto-open rule: nothing enlarged → enlarge it and show;
  another cell enlarged → do not take the screen, show it when that cell is enlarged.
- Paths stay inside the cell's directory (the right pane's rule in `docs/file-surfaces.md`).
- Agents learn the tools from the tools' own `prompt` text, plus one line in claude's appended system
  prompt.
- One PR.

## Shape

- `common/paneCommand.ts` — the channel (`pane-command`), the command and check types, argument
  parsers for both tools, and `checkSummary()` (the text typed back). Pure; both sides use it.
- `server/infra/tools/pane-tools.ts` — the two `ToolDefinition`s; registered in `host-tools.ts`, grouped
  `render` in `common/toolGroups.ts`.
- `server/routes/pane-tool-routes.ts` — `POST /api/plugin/showInPane` and `/requestCheck` (session from
  the broker's header, path contained in `cwdForSessionHydrated`), publish on the channel; the open check
  per session is kept for `GET /api/pane/check/:sessionId` (a reload) and dropped by
  `POST /api/pane/check/:sessionId/close`.
- Browser: `TerminalGrid` listens and applies a command to the enlarged cell or keeps it for when that
  cell is enlarged; `GridView` enlarges the cell when nothing is enlarged. `FilesPane.showFile(path,
  { view, line })` (logic in `useShowFile`) opens a file as editor / preview / canvas / split. A new right
  pane `check` (`CheckPane.vue`) lists the items with Open, OK / NG and a note; Send types the summary.

## Out of scope

- Blocking until the human answers; polling for results.
- Agents whose MCP cannot reach the render group get nothing new.
