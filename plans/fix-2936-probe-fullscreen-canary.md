# fix: usage probe must not trip Claude Code's fullscreen canary (#2936)

Claude Code records a fullscreen launch as pending until the first frame is 10 seconds old or the
process exits cleanly. The usage probe is killed seconds after it answers, so each successful probe
counts as a failed start; two on one version write `fullscreenAutoDisabled` into that login's
`.claude.json`, which beats `"tui": "fullscreen"` for every cell.

## Change
- `PROBE_ENV` (`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`) and `probeSpawnEnv()` in `rate-limit-probe.ts`.
- Both probe spawns in `rate-limit-service.ts` (default login, and `startHomeProbe` for accounts and
  rotation tokens) lay it over their environment.

## Not changed
- Cells: `claude-fullscreen.ts` still decides their renderer.
- The probe reads the status line only, so the renderer does not affect its result.
- The hidden translation worker (`server/session/translation-worker.ts`) is also reaped early but goes through the cell spawn path in `spawn-claude.ts`; whether it trips the canary is unmeasured, so it is left for a separate issue.

## Verify
- Unit: `probeSpawnEnv` keeps login variables and the pin wins.
- Call sites: `rate-limit-service.spec.ts` drives the default-login probe and `startHomeProbe` and asserts what reaches `spawnPty`.
- Not exercised: a real Claude Code update followed by probes; the claim about the canary rests on
  the issue's reading of the 2.1.287 bundle.
