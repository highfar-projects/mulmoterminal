# fix: stop folding once a cell is full (#3194)

## Problem

tmux's `screen_write_combine` refuses a fold that would take a cell past `UTF8_SIZE` bytes, and
psmux's `join()` past `MAX_CELL_BYTES`. None of the fold rules modelled it, so a long ZWJ sequence
kept folding in the browser while tmux had started a new cell, and the rest of the row moved.

## The limits, read from the source

- tmux 3.4, 3.5, 3.5a: `UTF8_SIZE` 21. tmux 3.6, 3.6a: 32. psmux 3.4.0: 32.
- The check comes after every other fold decision (filler, zero width, jamo, should_combine, ZWJ),
  so it only turns a fold into something else. tmux then writes the character as a cell of its own
  (a zero-width one moves no column); psmux discards a zero-width one. Both leave the cursor where
  a drop would.

## Decision

- `ClusterCell` carries the cell's UTF-8 bytes; every rule refuses a fold past its limit
  (`CELL_BYTES_LIMIT`): a zero-width character is dropped, a visible one starts a new cell.
- The provider state had no room for six more bits, so a cell keeps the KIND of its first codepoint
  (ASCII, regional indicator, skin tone, skin-tone base, U+1F483, other) instead of the codepoint.
  Those are the only questions any rule asks of it. The state now takes 15 of xterm's 24 free bits.

## Verification

- Old and new rules and provider compared on generated inputs short enough never to reach a limit,
  every rule, two tables, both `vs16Wide` values: identical (the command and count are in the PR).
- Over-limit rows added to the shared ground-truth samples. On tmux 3.6a they pass, and fail with
  the cap removed. tmux 3.4's limit of 21 is checked by the same spec on Ubuntu CI.
