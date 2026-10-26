# fix: refuse requests addressed to an unconfigured host (#3188)

## The defect (reproduced)

GET routes answered any `Host`. On a test server, `curl -H 'Host: attacker.example:34599'` got `200`
with real content from `/api/sessions` and `/api/config`. A DNS-rebinding page reads those as
same-origin: it sends no `Origin`, so the central gate has nothing to judge, and that gate covers
state-changing methods only anyway.

## Decision

App-wide, chosen by the maintainer: one middleware ahead of every route, rather than a list of
"sensitive" GETs that a new route can forget to join.

## Change

- `server/infra/http/host-guard.ts`: `hostGuard(isAllowedHost)` refuses with `403 text/plain` and a
  sentence naming the setting that would let the name in.
- `server/routes/request-gates.ts`: `mountRequestGates` mounts the Host gate and then the same-origin
  gate, and is the first statement of `mountAppRoutes`. A spec drives both gates on a real Express
  server (a foreign Host reaches no route and no fallback), and checks from the source, comments
  stripped, that `mountAppRoutes` calls it first.
- A Host that is not a bare `host[:port]` (userinfo `@`, `/`, `?`, `#`, `\`, whitespace) is refused
  before parsing: `new URL()` would read `evil.example@localhost` as hostname `localhost`.
- The list is `createIsAllowedHost` (#3185): loopback plus `MULMOTERMINAL_HOST` and
  `MULMOTERMINAL_ALLOWED_ORIGINS`, the same as the Origin check.
- The per-route Host check on `GET /api/terminal/:sessionId/screen` is removed; the guard covers it.
- `bindSecurityWarning` now says a name not on the list is refused (403), where before it said the
  page loads and the terminal fails to attach.

## Who is affected

- Every caller this server spawns comes back on `localhost` / `127.0.0.1`: Claude hooks
  (`hookSettingsJson("localhost")`), the codex and agy hooks, the MCP bridge (`127.0.0.1`), and the
  rate-limit poller.
- The Vite dev proxy sets `changeOrigin: true`, so the backend sees `localhost:<port>`.
- WebSocket upgrades and socket.io do not pass through Express. They keep their Origin check, which
  a rebound page fails.
- **Changed:** a wildcard bind (`0.0.0.0`) with no `MULMOTERMINAL_ALLOWED_ORIGINS`, opened by LAN IP.
  Before, the page loaded and then no terminal attached. Now every request is a 403 that names the
  setting to add. The guide (en/ja) and the startup warning say so.
