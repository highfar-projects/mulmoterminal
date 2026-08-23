# Serving loopback again when the operator widens the bind (#1834)

`MULMOTERMINAL_HOST=<a specific address>` is the documented opt-in for reaching this server from
another machine. Setting it makes every claude session's hooks fail on every tool call and leaves
the GUI MCP stuck on "still connecting", because binding ONE address stops serving loopback — and
everything this server spawns reaches back to it over loopback.

## Why not point the sessions at the bound address

That is the obvious fix and it does not work. Measured, on a server bound to `192.168.64.1`:

```
curl -X POST http://192.168.64.1:34710/api/hook   ->  403 {"error":"forbidden origin"}
```

A hook is `curl`, which sends no Origin, and `isAllowedOrigin` trusts an Origin-less request only
when the PEER is loopback. A local process reaching us on `192.168.64.1` has peer `192.168.64.1`
(measured), so it is refused. The fix would therefore have to widen the one predicate standing
between a visited web page and the user's terminal — and it still would not be enough, because two
of the eight callers cannot be reached from here at all:

| | who dials loopback | reachable from a code change? |
|---|---|---|
| `spawn-claude.ts:220-221` | claude hooks + GUI MCP | yes |
| `mcp-config.ts` `DEFAULT_HOST` | codex cells | yes |
| `index.ts` rate-limit probe | yes |
| `gui-mcp-registration.ts` | grid cells | **no — the url is already written into the user's `.mcp.json`** |
| `mcp/bridge.mjs` | muse bridge | **no — argv from a machine-wide plugin manifest** |
| `mcp-routes.ts`, `plugin-routes.ts` | this server calling itself | yes |

## What this does instead

Restore the assumption. When the primary bind does not serve `127.0.0.1`, listen on it as well.

All eight callers keep working unchanged, the origin predicate is untouched, and no migration is
needed for the urls already on users' disks. Exposure does not grow: loopback is reachable only
from this machine, and it is what an untouched install already serves — the operator asked to ADD
an interface, not to remove that one.

## The rule is about the v4 loopback specifically

Not "is the bind loopback". `MULMOTERMINAL_HOST=localhost` resolves to `::1` on a dual-stack
machine, and a server there REFUSES a client dialing `127.0.0.1` (both measured) — so the GUI MCP
url, which says `127.0.0.1` literally, is unreachable today. That is a second, unreported bug the
same rule closes. Six of the eight callers write `127.0.0.1` and none writes `::1`, so the second
listener always takes the v4 loopback.

The decision reads `server.address()` rather than `MULMOTERMINAL_HOST`, for the reason
`infra/loopback.ts` already gives: `localhost`, `127.1` and `127.000.000.001` all mean loopback and
a hosts file can point `localhost` elsewhere, so only the resolved answer covers every spelling.

## Verified

Every bind, on the real app: hooks POST, the GUI MCP url, and a PTY over the terminal WebSocket.

| `MULMOTERMINAL_HOST` | 2nd listener | hook | GUI MCP | PTY |
|---|---|---|---|---|
| unset | no | 200 | reachable | ok |
| `0.0.0.0` | no | 200 | reachable | ok |
| `localhost` | **yes** | 200 | **reachable (was refused)** | ok |
| `192.168.64.1` | **yes** | **200 (was refused)** | **reachable (was refused)** | ok |

Plus a real browser against both listeners — the grid loads and a shell cell reaches a prompt, with
no console errors — because the change puts a second server in front of every request and every
WebSocket, which a green suite does not exercise.

## Known gap

A Linux kernel with `net.ipv6.bindv6only=1` makes `::` v6-only, and the wildcard check assumes it
covers v4. Attempting the bind instead would warn on the EADDRINUSE that a correct dual-stack setup
produces every time, which trains the operator to ignore the warning that means something.
