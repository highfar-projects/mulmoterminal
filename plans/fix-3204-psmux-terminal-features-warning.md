# fix #3204 — psmux: `unknown option 'terminal-features'` in every new cell

On Windows with psmux 3.4.0 every new cell opens with

```
psmux: 1 config warning(s):
psmux:   ~\.mulmoterminal\tmux.conf:8: unknown option 'terminal-features'
```

Seen in the #3201 report; the cell works, the line is noise on every session.

## Why

`TMUX_CONF_LINES` (`server/infra/process/tmux.ts`) writes `set -as terminal-features '*:hyperlinks'`
so that tmux forwards a program's OSC 8 hyperlinks to the outer xterm instead of stripping them
(#783). psmux has no such option: its 3.4.0 option catalog (`src/server/option_catalog.rs`) lists
`terminal-overrides` but not `terminal-features`, and its master only names it in the list of tmux
option names it accepts without meaning. psmux forwards OSC 8 to its client with no declaration
(`src/client.rs`, `build_osc8_overlay`, psmux#361). The warning became visible in 3.4.0 (psmux#706
made config warnings reach the screen of an attached start).

PR #3133 left the fork's filter out because it had been measured on 3.3.8 only; #3201 shows it on
3.4.0.

## The fix

- `tmuxConfLinesFor(psmux)`: the conf a given tmux is handed — `TMUX_CONF_LINES` for a real tmux
  (the same array), the same minus the `terminal-features` line for psmux. `ensureConf` writes that.
- `applyLiveHyperlinksFeature()`: the live `show -g` / `set -as terminal-features` on a server that
  outlived this process is not sent to psmux. It failed silently there; now it is not asked.
- `terminal-overrides` (the `Ms` entry for OSC 52) stays: psmux 3.4.0 knows the option, and the
  report shows one warning, not two.

## Verification

- `test/server/infra/process/tmux.spec.ts`: a real tmux gets the same array; psmux gets exactly one
  line fewer, in order, with the Ms entry and set-clipboard still there.
- `test/server/infra/process/tmux-psmux-scrub.spec.ts`: through `tmuxAvailable()` with tmux replaced
  by a recorder — the conf written for psmux has no `terminal-features`, and no `terminal-features`
  command is sent to the running server; a real tmux gets both.
- Not run on psmux (no Windows machine); the option catalog and the OSC 8 path are read from
  psmux's 3.4.0 source.
