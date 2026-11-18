# feat: cells from another MulmoTerminal server in this tab — peer hosts, stage 1 (fork prototype)

On Windows the user runs two servers, one in WSL and one native (psmux), and wants both in one
browser tab. More generally: one tab, several machines.

## Shape: this server relays the peer

`"peers": [{ "id": "win", "label": "Windows", "url": "http://127.0.0.1:34568" }]` in
`~/.mulmoterminal/config.json`. `/peer/<id>/…` on this server is `/…` on the peer, for HTTP and for
WebSocket upgrades (`server/infra/http/peer-proxy.ts`).

- The page stays same-origin with this server, so neither server relaxes its origin check or
  speaks CORS. The relay rewrites `Origin`/`Host` to the peer's own, after applying THIS server's
  guard to the browser's real Origin.
- The browser names a peer by id only; the url never leaves the server. `peers` is a key only the
  file can set: the config POST keeps unknown keys from the file, not from the request.
- A WebSocket is piped byte for byte after the peer's 101, so every terminal endpoint works through
  it without the relay knowing any of them.
- Client side, a cell's `host` (peer id) changes only the url's host part: every endpoint builder
  writes `${proto}//${host}/${path}`, so `peerWsHost` returns `location.host + "/peer/<id>"`.

Rejected: the browser connecting to each server directly. It needs the origin guard and CORS relaxed
on every server, and all ~177 `/api` call sites made host-aware before anything works.

## Stage 1 (this change)

- Launch form: a "Run on" picker when peers are configured. With a peer picked, this server's
  folder checks (exists, worktree taken, devcontainer offer), the OS folder dialog, the worktree
  rows and the resume list are skipped or hidden: they describe this machine.
- The cell remembers its peer across a reload (`Cell.host`, `AgentReport.host`) and shows the
  peer's label in its header.
- Refused with a notice, rather than doing the wrong thing on this server:
  - a shell on a peer (a shell is a launcher cell, which carries no peer yet);
  - "Restart the agent" on a peer cell (its reap is a request to this server).

Measured with two scratch servers and headless Chrome: a page served by A started a cell on B (the
fake `claude` printed B's HOME), keystrokes reached B, and a page reload reattached the same process
(same `$$`).

## Stage 2: a peer cell's activity

- `usePubSub(host)` keeps one socket per server; a peer's is its own socket.io, reached at
  `/peer/<id>/ws/pubsub` through the relay. `usePubSub()` is this server, unchanged.
- TerminalCell listens to its own server's `sessions` stream and seeds from its
  `/api/session/:id` (`peerApiPath`), re-wiring if the cell's server changes before launch. The
  Canvas count is not wired on a peer: the pane still reads this server.
- `useGridActivity(ids, hostOf)` seeds each server from its own `/api/activity` and listens to each
  server holding a cell, so off-page peer cells still rank and route attention.
- The attention sound and the favicon also listen to every configured peer (`subscribeEveryPeer`).
  A directory's own sound is asked of the server the directory is on, keyed by host.

Measured with two scratch servers: hooks posted to B (prompt, Notification, Stop) turned the peer
cell's frame working, blocked, then done on A's page; a reload came back done from B's snapshot; the
sound path fired for both and asked `/peer/b/api/dir-sound`.

## Not yet (later stages)

3. Per-cell features against the peer: the seven `/api/session/:id/…` routes, restart, diff, files,
   usage. Each surface that acts on "the machine" needs its own decision (see docs/file-surfaces.md).
4. The peer's saved folders and past sessions in the launch form; a shell cell on a peer.
5. Showing a peer that is down as such, per cell.
