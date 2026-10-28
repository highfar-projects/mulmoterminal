# fix #3201 — Windows / psmux: a Codex cell ends at once with `psmux: can't find session`

On Windows with psmux 3.4.0, a new Codex cell shows

```
psmux: can't find session: mulmoterminal__mt-<id>
[session ended — exit 1]
```

while a Claude cell on the same machine and worktree runs. Codex is installed from npm
(`codex`, `codex.cmd`, `codex.ps1`, no `codex.exe`); Claude is the native `claude.exe`.

## Why it fails

`ptySpawn` hands the pane's program to `tmux new-session -A … -- <file> <args>` unchanged.
psmux takes a `--` command as an argument vector (`create_window_raw` → `build_raw_command`,
psmux 3.4.0 `src/pane.rs`) and starts it with `CreateProcessW`, after resolving the bare name
itself: the first file on PATH spelled exactly like the name, then one per `PATHEXT` extension
(`crates/portable-pty-psmux/src/cmdbuilder.rs`, `search_path`). For an npm install that is the
extensionless shim, or the `.cmd` — neither is a PE image, so the spawn fails, the fresh psmux
server exits, and the attaching client reports the session it was told to create as missing.

The direct (no-tmux) spawn solved the same thing in #798 / #801: `spawnPty` resolves a bare name
to an `.exe`, or wraps a batch shim in `cmd.exe /d /s /c "…"` (`infra/process/resolve-bin.ts`).
That resolution ran only for node-pty's own spawn; the tmux branch never asked for it.

psmux's master has since added the same wrapping on its side (`batch_script_target` in
`src/pane.rs`, after the 3.4.0 release of 2026-10-13); the released 3.4.0 does not have it.

## The fix

`resolveTmuxPaneLaunch` (`server/infra/process/resolve-bin.ts`): the same decision as
`resolvePtyLaunch` — the `.exe` by its path, a batch shim through cmd.exe — carried the way a
multiplexer can take it:

- the `.exe` case names the file by its absolute path, so psmux cannot pick the extensionless
  shim that sits beside the `.cmd` (it takes an exact-name match before trying extensions);
- the batch case is `cmd.exe /d /e:ON /v:OFF /c %MULMOTERMINAL_BATCH_COMMAND_LINE%`, with the
  quoted command (`"C:\…\codex.cmd" "-c" "…"`, every word quoted by `escapeBatchArgument`) in that
  variable, set on the session with `new-session -e`. The raw `/d /s /c "…"` string of the direct
  route cannot be used: psmux quotes every argv word for the CRT, so the quotes inside would be
  re-escaped and cmd.exe would read a different line. No word in the argv holds a space or a
  quote, so that quoting leaves each one as written; cmd.exe expands the variable once in its `/c`
  text and then parses what came out. psmux itself uses this route for its own batch wrapping.

`ptySpawn`'s tmux branch asks it against the pane's environment (the one the binary check already
uses), and merges the variable into the `-e` set. Off Windows the function is the identity and the
tmux branch is unchanged.

## Verification

- `test/server/infra/process/resolve-bin.spec.ts`: the new resolver's rules, and that it names the
  same file as `resolvePtyLaunch` for every PATH layout the direct route is tested on.
- `test/server/infra/process/cmd-escape.spec.ts`: `batchCommand` is exactly what
  `batchCommandLine` wraps.
- `test/server/session/pty/pty-spawn-env.spec.ts`: the tmux branch asks for the resolution of the
  original name against the pane's environment and carries file, argv and variables into
  `new-session`.
- `test/server/session/pty/pty-spawn-win.spec.ts` (Windows CI): the cmd.exe half, measured — the
  argv a `.cmd` shim's child receives through `cmd.exe /d /e:ON /v:OFF /c %VAR%` is the one passed,
  for the same argument table the direct route is checked with, codex's TOML overrides included,
  and a `%VAR%` inside an argument is not expanded a second time.
- The refactor of `resolvePtyLaunch` (shared `windowsProgram`) was checked by running the old
  function verbatim beside the new one over generated inputs (harness not committed).
- Not run on psmux: no Windows machine here. psmux's side — `--` as an argument vector, `-e`
  reaching the pane, `search_path` taking the exact name first — is read from its 3.4.0 source.

## Out of scope

- The `psmux: ~\.mulmoterminal\tmux.conf:8: unknown option 'terminal-features'` warning the same
  report shows: cosmetic, every psmux session prints it, and PR #3133 left the fork's conf filter
  out on purpose. A separate change.
