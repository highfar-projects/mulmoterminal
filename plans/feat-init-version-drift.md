# feat: `init` compares Node and Claude Code against the latest releases (#2477)

## Why

`npx mulmoterminal init` only checks that Node meets the minimum and that `claude` exists. A Claude
Code too old for a flag MulmoTerminal passes (#2352) still gets a ✓. Comparing against the published
releases tells the user to update before a cell fails.

## Scope

- Only `init` runs this. `runInit` loads the new module with `await import()`, the way `stop` and
  `room` are loaded, so a normal launch neither executes nor loads it.
- **Node** — `https://nodejs.org/dist/index.json`. Compare with the newest LTS of the SAME major; a
  major with no LTS release (odd, or not yet promoted) is compared with the newest LTS overall,
  unless it is newer than that LTS, in which case it is left alone. The minimum-version ✗ is
  unchanged.
- **Claude Code** — the npm dist-tag `stable` of `@anthropic-ai/claude-code`, never `latest`
  (published almost daily, so it would always nag). The local version comes from
  `<CLAUDE_BIN or claude> --version`.
- **How to update** — Node reuses `nodeUpgradeGuide` (the launcher's version gate already works out
  the install tool from `process.execPath`). Claude Code resolves the binary's real path: under
  `.local/share/claude/` is the native installer (`claude update`), under
  `node_modules/@anthropic-ai/claude-code/` is npm. Anything else gets both, in the wording
  `server/agents/claude-permission-modes.ts` already uses.
- **Failure** — a failed fetch, a timeout, or an unreadable version prints one `○` line saying the
  check could not run. `init` never fails because of this.

## Shape

- `bin/version-drift.js` — pure: `nodeDrift`, `claudeDrift`, `parseClaudeVersion`,
  `claudeUpdateCommands`, `nodeDriftLines`, `claudeDriftLines`. No fs / network / process.
- `bin/check-versions.js` — the I/O: fetch both sources with an abort timeout, run
  `claude --version`, resolve the binary path, and hand the results to the pure functions.
- `bin/mulmoterminal.js` — `runInit` starts the check before printing, then prints the hint lines
  under the existing Node / Claude Code lines. The existing lines are not changed.
- Specs in `test/bin/` for both files; the network is stubbed.

## Out of scope

- Feature detection (`--permission-mode auto`) — done in #2352 on the server side.
- Any version comparison outside `init`.
