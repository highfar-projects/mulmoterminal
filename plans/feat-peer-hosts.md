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

## Stage 3: a peer cell's own features

Asked of the peer (`peerApiPath`, or a `host` argument threaded into the composable):

- Restart the agent, the close button and the subscription switch (`/api/session/:id/terminate`,
  `/switch-token`) — the refusal stage 1 put on restart is gone.
- The memo, the timeline overlay, the diff badge and overlay, and the worktree actions
  (`/api/worktrees/{diff,push,pr,remove}`).
- The header's git chip, PR/work-item chip, configured chips and the model/context badge
  (`useGitStatus`, `useWorkItem`, `useHeaderButtons`, `useSessionContext`).
- The directory's config — colours, theme, icon, background — keyed by `peerDirKey`, the cwd itself
  for this server, with its own `/api/…` links rewritten through the relay, and invalidated by the
  peer's own `dir-config` channel. The devcontainer badge and its build/stop/fix actions.
- A dropped file or a pasted image is uploaded to the peer, and a peer cell always uploads (like
  `remoteServer`): the browser's path names the browser's machine.
- The grid: "priority" order, the roster's row text, PR phase and chrome, and closing a cell.

Withheld on a peer cell, because each acts on THIS machine:

- The path menu (reveal, insert a path, the Files pane, a shell here) — the cell names its directory
  instead; "new terminal here"; the Run menu and the path-menu file picker; header buttons other than
  `run: "input"`; the Mulmo deck; Copy code block; the subscription choices on the account mark.
- A peer's directory is never recorded among this server's presets.

Measured with two scratch servers: on A's page, the peer cell's git chip read B's repo
(`peer-branch●1`); "Restart the agent" ended B's session and started a new one on B; after a fresh
start of A, no request about B's directory or session reached A at all.

## Not yet (later stages)

4. The Canvas and the Files pane for a peer cell — a containment decision first
   (docs/file-surfaces.md).
5. The peer's saved folders and past sessions in the launch form; a shell cell on a peer.
6. Showing a peer that is down as such, per cell.
