# fix: a symlinked workspace leaves every probe transcript behind (#3152)

## Problem

Claude names a project's transcript directory after the REAL path of its working directory.
`projectSessionsDir` encoded `path.resolve(cwd)`, which keeps a symlink as it is, so with a symlinked
`CLAUDE_CWD` the usage probe's transcript was looked for in a directory that does not exist. The
`rm` failed silently, and one `reply with the single character: .` conversation piled up in
`claude --resume` every probe (921 in the report).

## Reproduced

On macOS, `claude -p` run with a symlink as its cwd wrote under `…-real/`, while
`projectSessionsDir(<link>)` named `…-link`. The same run in a directory typed with the wrong case
(`casedir` for `CaseDir`) wrote under `…-CaseDir`: claude takes the case the disk spells. That is
what `fs.realpathSync.native` returns and plain `fs.realpathSync` does not, so `.native` it is.

## Fix

- `claudeProjectPath(cwd)` in `server/session/project-dir.ts`: the absolute path, resolved with
  `realpathSync.native`, falling back to the absolute path when it cannot be resolved. The resolver
  is injected so the fallback is testable.
- `projectSessionsDir` encodes that, so every caller follows: the probe's removal, `--resume`
  lookup, the roster and cost views, the translation worker's cleanup.
- The legacy sweep's marker is named the same way, so a symlinked workspace's REAL directory gets
  its one sweep.
- `removeStrayProbeTranscripts`, run at every boot: removes files in the workspace's transcript
  directory whose name is a probe's id and that are older than ten minutes. The name is one only a
  probe carries, so this is not a guess like the legacy sweep; the age keeps it off a probe another
  server sharing the workspace is running. This removes what has already piled up.

## Out of scope

- `decisionDigestPath` also encodes a cwd, but names a file of ours; it is left as it is.
- Stray probe transcripts under an account's or rotation token's own home are not swept at boot;
  their future probes are removed correctly by the same fix.
- Other places that compare a session's recorded `cwd` with a configured path were not audited.
