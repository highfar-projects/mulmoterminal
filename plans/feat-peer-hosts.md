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

## Stage 4: the right pane for a peer cell

**The containment decision** (docs/file-surfaces.md): reach is set by who chose the path. For a peer
cell that is unchanged — the user, by opening the pane on that cell — and the root is that cell's
directory, which on the PEER is a live session directory. The relay only carries the request; every
containment rule (`resolveContained`, `authorizedServingBase`, the one-file grant) is applied by the
peer's own routes, exactly as for a browser talking to it directly. So no surface reaches further
than it did; the pane is simply asked of the server the directory is on.

- `paneHost.ts`: TerminalGrid provides the host of the cell each pane answers for — the files pane's
  root cell while it is the pane (declining a re-root can leave it behind), otherwise the pane cell.
  Components and the composables they call in setup inject it; outside setup it is this server.
- Files pane: every `/api/files/*` request goes through `peerApiPath`; the listings take the root as
  a `peerDirKey` (`usePaneDirKey`), so their cache is per server. The pane is keyed by host in
  TerminalGrid, so a pane moved to another server is a fresh mount. Withheld on a peer: reveal,
  open in an application, open on the Canvas, open as a spreadsheet (each acts on, or stores into,
  THIS server).
- Previews: a document the peer renders writes root-relative links of its own (a Markdown image,
  the mermaid module, an HTML page's redirect). The relay sends `X-Forwarded-Prefix: /peer/<id>`
  (replacing anything the browser sent), and the peer puts it in front of those links
  (`infra/http/forwarded-prefix.ts`, exact `/peer/<id>` shape only). A peer on an older version
  ignores the header: its previews then show text but not images.
- Canvas, Tools, Prompts, Transcript: history, live channel (`useSessionFeed`'s `host`), tool lists
  and the stored-card check go to the peer; the grid's "a card was drawn" reveal listens on the
  cell's own server. The peer cell's directory label opens the Files pane.

Measured with two scratch servers: on A's page, the Files pane for a peer cell listed B's folder with
B's git marks, previewed B's README through `/peer/b/api/files/browse/md` with its image loaded from
`/peer/b/api/files/raw`, and a card POSTed to B opened the Canvas on A by itself and drew
"Hello from server B". No file or canvas request reached A.

## Stage 5: the launch form on a peer, and a shell there

- TerminalCell and LaunchPanel provide the picked server (`providePaneHost`), so everything the launch
  form reads is that server's: the directory lists (`useDirList` — past sessions, worktrees, scripts),
  path suggestions and the "not there" check, the GUI tool-group switches, stopping / renaming /
  deleting a listed session, creating / removing a worktree, and which agents can start
  (`useAgentAvailability`, now one answer per server).
- The saved-folder chips and the default workspace are the peer's, read from its `/api/config`
  (`usePeerLaunchDirs`); their colours, icons and rank are keyed by `peerDirKey`. A peer's chip has no
  remove button (it would edit this server's list).
- Withheld on a peer: the script, launch-config and configured-launcher chips (each opens a command
  cell this server runs) and the devcontainer offer (this server's routes).
- A resumed row and a worktree's session carry the peer (`ResumeRequest.host`, `PanelResume.host`).
- A shell runs there: `LaunchPick.host` → `launchInCell(…, host)`, and LauncherCell / CellShell pass
  it to the terminal and the chrome, show the peer's badge, and withhold the path menu.

Measured with two scratch servers: with B picked in A's form, the chips were B's folders only and
had no remove button; B's past session was listed and resuming it reconnected B's session by id; a
Shell started from the launch panel ran on B (`$HOME` was B's) with the "Server B" badge and B's git
chip. A saw no terminal connection at all.

## Stage 6: questions, pane commands, and a peer that is down

- A session-to-server map (`peerHosts.ts` `watchSessionHosts` / `sessionHostOf`, kept by GridView from
  its cells — session ids are UUIDs, so one map serves every server) routes the helpers handed a
  session id alone: the question pane's read and answer (`openQuestion.ts`), a checklist's read and
  close (`openCheck.ts`).
- The question channel and the pane-command channel (`showInPane`) are listened to on every peer
  too, in TerminalGrid and in GridView's reveal (`useRevealOnPaneCommand`).
- `GET /api/peers/status` probes each peer (any HTTP answer is "up", a refused or silent connection
  "down"); the page asks every 15s while visible and only when peers exist. `PeerBadge` — the badge
  on a TerminalCell and on a shell/launcher cell — turns amber with `cloud_off` and says the peer is
  not answering.

Measured with two scratch servers: an AskUserQuestion hook posted to B opened the question pane on
A's page with B's options, and picking one posted the answer to `/peer/b/api/question/<id>/answer`.
Stopping B turned the badge to "not answering" within a poll; starting B again turned it back.

## Known limits

- A question or checklist that arrives while a peer's pub/sub socket is down is not re-read when
  that socket reconnects (only this server's reconnect re-reads); enlarging the cell again does.
- Nothing here has run against a real Claude on a real WSL + Windows pair yet — every measurement
  above used a fake `claude` and hand-posted hooks.
