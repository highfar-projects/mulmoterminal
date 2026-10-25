# fix: count terminal cells the way the tmux on this machine does (#3173)

## Problem

The browser's xterm decides how many columns a character takes from a fixed table: "11" behind
psmux, xterm's default "6" behind a real tmux (#3117). tmux decides the same thing from its own
table (utf8proc or the C library's `wcwidth`, plus `codepoint-widths`), and places every following
character from that answer. When the two disagree, everything after the character on that row is
drawn one column off — the reported case is `✅`, which tmux 3.6 counts as two columns on WSL2 AND
on macOS while "6" counts it as one.

Swapping "6" for "11" narrows the gap but does not close it: newer emoji still disagree, and
neither table knows what tmux does with sequences (a variation selector, a ZWJ family, a skin tone,
a flag), which tmux folds into one cell of width 2 while xterm adds up each codepoint.

## Decision

The authority is the tmux this server runs, so ask it rather than pick a table:

1. **Measure per-codepoint widths at boot.** A throwaway tmux server on an absolute `-S` socket
   (never the live `-L mulmoterminal` one), started with `-f /dev/null` (our conf sets nothing that
   changes widths, and it carries hooks a probe must not fire), in the environment a session gets.
   `display-message -p '#{w:#{l:…}}'` is asked for every codepoint in batches. The answers are kept as
   runs of non-1 widths.
2. **Mirror tmux's folding rules** (`screen_write_combine`). They differ by release, so there is one
   mirror per rule. tmux 3.6: a regional-indicator pair and a skin tone after a listed base fold and
   force width 2, `variation-selector-always-wide` decides `U+FE0F`, Hangul jamo compose by class.
   tmux 3.4/3.5: anything in the modifier table folds into any cell but a lone ASCII byte, and
   `U+FE0F` always widens. Both: a ZWJ and zero-width characters fold, and anything after a cell
   ending in ZWJ folds into it.
3. **Pick the rule by measuring.** Sample sequences are printed in the throwaway pane and their
   width read from `#{cursor_x}`; the first rule whose predictions all of them match is used, else
   sequences are counted per character and the mismatch is logged. (The first version knew only the
   3.6 rule; Ubuntu CI's tmux 3.4 failed the check and fell back, which the ground-truth spec caught.)
4. **Hand the result to xterm as its own width table** (`term.unicode.register`, version `tmux`).
   The provider is a pure function in `common/`, so the browser and a headless test use the same one.
5. **Fallback** when nothing was measured (psmux, no tmux, a probe that failed or has not finished):
   "11", which is closer than "6" to every tmux and to Claude Code's own `Bun.stringWidth`.

## Not in scope

- `server/session/pty/headlessScreen.ts` renders sessions that have NO tmux, so there is no tmux to
  agree with; it keeps xterm's default.
- psmux is not probed: its format support is unverified here, and it keeps "11" as before.

## Verification

- Pure specs for the run builder, the guard, the lookup and the cluster rule, normal and malformed.
- Ground truth: real tmux output (a client attached through a PTY) fed into `@xterm/headless` with
  the provider, compared cell by cell with `tmux capture-pane`. Skipped where tmux is absent.
