# feat: detect which agents can run, and report it over an API (#2229)

Server side only. The pickers that grey out an unusable agent come after #2215's launch screen, and
the install guidance is #2230.

## Decisions (settled with the user before implementation)

- **Detected once, at server start.** An agent installed while the server runs shows up after a
  restart. (Checking every request was measured at well under a millisecond for all agents and was
  offered; start-up was chosen.)
- **A new API, `GET /api/agents/availability`**, rather than a field on `/api/config`: this is the
  machine's state, not the user's configuration.

## Design

- **The same check the spawn makes.** `diagnoseBinary(AGENT_BINS[agent], ptyEnv())` is what
  `pty-spawn.ts` refuses a spawn on, against the same environment, so "available" and "the spawn
  will not be refused for its binary" cannot disagree. `<AGENT>_BIN` overrides are honoured because
  `AGENT_BINS` already resolves them. Nothing is executed, only looked up.
- `server/agents/agent-availability.ts`: a pure `agentAvailability(bins, diagnose)` giving one entry
  per agent in `TERMINAL_AGENTS` order: `{ agent, bin, available, reason? }`. The reason is the
  diagnosis kind (`missing` / `no-such-path` / `not-executable`), which is what #2230's wording
  depends on. No paths and no PATH listing go over the wire.
- The wire shape lives in `common/agentAvailability.ts`, since the UI will read it.
- Custom agents are not listed: the user declared them, and their command is theirs.

## Tests

- The pure function: every agent answered, in order; each diagnosis kind maps to its reason; the bin
  given is the bin reported.
- The route: it answers with the snapshot it was handed, so nothing is re-checked per request.
