# feat: switch the usage gauge off, and set how often it measures Claude (#3153)

## Problem

The 5h / 7d usage gauge in the grid header measures Claude by starting a hidden `claude` that makes
one API call, about every ten minutes while the terminals screen is open. That call spends the very
budget the gauge reports, and it loads the user's whole environment (hooks, CLAUDE.md, MCP, skills),
so it can be heavier than it looks. Nothing in the config could stop it or slow it down.

## Approach

Two global keys in `~/.mulmoterminal/config.json`, both in Settings → Grid header read-outs:

- `usageGauge` (boolean, default `true`). `false` hides the gauge, so the browser stops asking, and
  the server refuses to start a probe on a refresh that arrives anyway (an old tab).
- `usageProbeIntervalMinutes` (whole minutes, default 10, clamped to 2–60). How old Claude's reading
  must be before a probe is spent on a new one: `RATE_LIMIT_STALE_MS` stops being a constant for
  that question.

Both are defined once in `common/usageGauge.ts` (default, range, sanitizer), read by the server per
refresh through `getUsageGauge()` so a change applies without a restart, and hydrated in the browser
from `/api/config`.

## Decisions

- **Range 2–60 minutes.** The browser asks every two minutes, so a shorter interval measures no more
  often. Sixty is where the gauge stops drawing a reading (`CLAUDE_READING_MAX_AGE_MS`): a longer
  interval would leave the Claude half blank between probes.
- **"Asked recently" is not the interval.** The rule that a browser must have asked within ten
  minutes is about someone looking, not about how old the reading is, so it keeps its own constant.
- **Accounts and rotation tokens follow the same two settings**: their meters are refreshed by the
  same route, and a per-login setting is not what the issue asks for.
- **Off stops Codex too**: the browser stops asking, and the Codex reading is only ever made when it
  asks. Nothing is spent on Codex, but there is no gauge to show it either.

## Out of scope

- A per-account interval.
- Measuring while the gauge is hidden, for token rotation's choice. With the gauge off, rotation
  chooses from the last readings it has, as it already does while the grid is closed.
