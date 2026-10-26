# fix: count cells the way psmux does (#3180)

## Problem

On psmux the browser counts with plain Unicode 11 and adds the parts of a sequence up, while psmux
folds variation selectors, ZWJ families, skin tones, flags and keycaps into one cell, as tmux does.
Rows holding them are drawn off by the difference. The tmux probe of #3174 cannot run on psmux:
`#{w:}` answers with a codepoint count, and `respawn-pane -k` drops the session.

## What the reporter measured, and what psmux's source says

- A throwaway server on `-S` is isolated from the user's sessions and goes away with `kill-server`.
- A sample can be printed in a session of its own (`new-session -d -s <name> '<command>'`) and read
  back with `#{cursor_x}`.
- Widths: `unicode-width` 0.2.2 (`crates/vt100-psmux/src/width.rs`), a Unicode 17 table, not 11.
  A width above 2 (U+17D8) occupies two columns in the grid.
- Folding: tmux 3.6a's `screen_write_combine`, except that a cell already holding two regional
  indicators takes no third, and there is no Hangul jamo composition. VS16 always widens.

## Decision

- `scripts/psmux-widths` (Rust, the same crate version) generates `common/psmuxWidthRuns.ts`.
- A `psmux` folding rule in `common/tmuxClusters.ts`; the cell carries how many regional indicators it
  holds, packed into the provider state.
- On psmux the boot probe prints `PSMUX_SAMPLES` (the cluster samples, a flag with a third indicator,
  and emoji added after Unicode 11), one session each, and keeps the generated table and rule only if
  every sample lands where they predict. Otherwise psmux stays on Unicode 11, as before.

## Not in scope

- tmux's and psmux's 32-byte cap on one cell (`UTF8_SIZE`, `MAX_CELL_BYTES`), which the mirrors do
  not model yet; a separate change for every rule.

## Verification

- The rule pinned to the reporter's `#{cursor_x}` readings on psmux 3.4.0.
- The probe against a fake psmux grid: kept when the samples match, refused when one is off, missing,
  or folded the tmux 3.6a way, or when post-Unicode-11 emoji count as one column.
- The print command's bytes, run through node.
- `test/server/infra/process/psmuxWidthProbe-windows.spec.ts`: on Windows with psmux, the kept table
  against psmux's own grid over fixed and seeded random rows. Run by the reporter.
