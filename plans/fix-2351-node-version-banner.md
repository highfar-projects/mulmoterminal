# fix: stop a normal launch on an unsupported Node, with a banner and upgrade steps (#2351)

## Problem

On Node below the minimum (22.12), `npx mulmoterminal` got as far as spawning the server, which
died on `--env-file-if-exists` ("bad option" / ".env: not found", code 9). Nothing said the
Node was too old. `nodeMeetsMinimum()` existed but only `init` called it.

## Change

- `bin/mulmoterminal.js` `main()`: after `--help` / `--version` (which still work on an old
  Node) and before the update check, the startup gate and any spawn, print the message to stderr
  and exit 1 when `nodeMeetsMinimum(process.versions.node)` is false.
- `bin/cli-args.js` `unsupportedNodeMessage(version, execPath, upgrade)`: a two-line
  "NODE / TOO OLD" banner, then the running version against `MIN_NODE_LABEL`, which binary is
  running, how it was installed, and the upgrade commands.
- `bin/node-install.js` `nodeUpgradeGuide(execPath, platform, env)`: pure; reads the install
  method off the resolved binary path (nodebrew, nvm, Volta, fnm, mise, asdf, Homebrew formula,
  Scoop app) and, on Windows, nvm-windows from `NVM_SYMLINK` / `NVM_HOME` — its symlink sits in
  the installer's own directory, so the path alone cannot tell them apart. The macOS .pkg,
  the Windows installer and a Linux system package get a name but no command.

## Decisions

- **ASCII `#`, not `█`.** Block characters are East-Asian "ambiguous width"; a terminal set to
  draw those double-width would wrap the banner. Every banner line fits 80 columns.
- **Only commands confirmed against the tool's own help or README.** fnm has no documented
  "latest LTS" name for `default`, so it gets an explicit major (a named constant). A method
  without a confirmed command gets only the download link.
- **"Open a new terminal"** after upgrading, because a version manager's switch applies to new
  shells.

## Scope

Only the normal launch path, as the issue asks. `init` keeps its own ✗ line; `stop`, `room`
and `google` are unchanged.

## Verification

- `test/bin/node-install.spec.ts`: each install method, Windows paths, nvm-windows vs installer,
  empty `NVM_SYMLINK`, unknown paths.
- `test/bin/cli-args.spec.ts`: message contents, fallback, ASCII-only banner within 80 columns.
- `test/bin/launcher-node-gate.spec.ts`: runs the real launcher with `process.versions.node`
  faked old via `--import`; a normal launch exits 1 with the banner before any startup check,
  `--version` / `--help` still answer. PATH and HOME point at an empty dir so a missing gate
  fails at the agent check rather than starting a server.
- Path-derived text is never pasted as-is: a Scoop app id that is not a plain manifest name gets
  no command, and the nvm-windows directory match is boundary-aware.
- Ran `bin/mulmoterminal.js` with a downloaded Node 20.13.0 binary, from its own path and copied
  under nodebrew / Homebrew-style paths: banner and the matching commands, exit 1, no server.
