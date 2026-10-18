# feat(worktree): keep the managed worktree root out of Time Machine and Spotlight (#3059)

## Decision

- Mark the ROOT (`~/.mulmoterminal/worktrees`, or `$MULMOTERMINAL_HOME/worktrees`) once, before the first
  worktree is cut there; every worktree created inside it later is covered. Marking each worktree
  instead would put an untracked file in it, which `isDirty` reads as a change and then refuses to
  remove.
- macOS only; on by default with no setting (the user's call on #3059). To back the worktrees up
  after all: `tmutil removeexclusion ~/.mulmoterminal/worktrees`.
- Best effort: a failure is logged and the worktree is made anyway.

## Measured (macOS 26.5)

- `tmutil addexclusion <dir>` (no `-p`) needs no sudo, excludes the directory's contents, and the
  sticky attribute goes away with the directory — no `removeexclusion` on delete.
- Through the real `createWorktree` on an included location: the root and the worktree cut inside
  it both report `[Excluded]`, the worktree's `git status` stays empty, and `git worktree remove`
  works without `--force`.

## Not measured

- Whether Spotlight honours `.metadata_never_index` on this macOS: `mdfind` from a terminal process
  returned nothing at all here (146 PNGs on the Desktop, 0 hits), so the effect could not be
  observed. The marker is written anyway; it costs nothing.

## Out of scope

- Claude Code's own `.claude/worktrees/` inside a repository (named in the issue's measurement) are
  not created by MulmoTerminal.
