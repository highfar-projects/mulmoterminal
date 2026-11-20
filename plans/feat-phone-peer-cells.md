# The phone reaches a peer's cells (fork)

## Problem

With the Windows launcher's `both` mode, the browser shows the WSL server's cells beside the
Windows ones through the peer relay (`common/peers.ts`, `infra/http/peer-proxy.ts`). The phone did
not: it is connected to ONE host — the Windows parent — so

- its session list held only the parent's own cells (`hostSessionList.ts` reads the local PTY table),
- a WSL cell's turns sent no push, because the WSL server holds no Firebase session to push with.

Connecting the WSL server as a second host (#3092) was rejected: the phone keeps one host per
browser, so the user would have to switch hosts to see the other half.

## Decision

The parent stands in for its peers, over the two channels it already has to them.

| What | How |
| --- | --- |
| List | `listTerminalSessions` merges every reachable peer's rows after ours, titled `[<label>] …`. Icons join the table under the existing `DIR_ICONS_MAX_CHARS` budget (the reply is a Firestore doc). |
| Session commands | `getTerminalScreen`, `getTerminalTranscript`, `sendTerminalInput`, `getOpenQuestion`, `answerQuestion`, `launchTerminal`, `listPastSessions`, `getPastTranscript`: a session that is not ours goes to the peer that listed it, on the peer's `POST /api/remote-host/peer-command`, which runs the peer's OWN handler. A miss (a notification tap before any list) re-lists the peers once. |
| Push | The peer publishes what it would have pushed on its pub/sub channel `peer-push` when anyone is subscribed, whatever its own push setting. The parent, subscribed with socket.io-client, sends it under its own Firebase session and host id, deciding by ITS `pushEnabled` / `pushKinds`. Title prefixed `[<label>]`. |
| Status dots | The parent also subscribes to the peer's `sessions` channel and mirrors working / waiting / event into its own Firestore session-activity docs (#439). |

Session ids are per-server UUIDs, so the phone gets them unchanged and the parent remembers which
peer each came from.

Modules: `server/backends/remoteHost/peerProtocol.ts` (names and the push shape),
`peerSessions.ts` (the wrapper), `peerClient.ts` (the HTTP call), `peerEvents.ts` (the pub/sub
subscriber), the route in `remoteHost/index.ts`, and `setPeerPushSink` / `relayPeerPush` in
`session/activity/task-push.ts`.

## Trust

The parent calls the peer with the peer's own `Origin`, exactly as the browser relay does: the peer
sees a same-origin request. Safe for the relay's reason — the URL comes from `peers` in config.json,
which only the user writes; nothing the phone or a page sends chooses it. The peer route is guarded
like every state-changing route (`requestOriginAllowed`), and answers only its own sessions: the
peer-side table is NOT wrapped, so two servers listing each other cannot bounce a command.

## Limits

- Both servers need this version. An older peer answers 404 on the route: its rows are simply
  absent, and its pushes never arrive.
- If the peer is ALSO connected to the phone as its own host, its pushes arrive twice.
- `launchTerminal` on a peer's session asks the peer's browser subscribers; the parent's tab is not
  subscribed to a peer's launch channel, so it answers "no browser is open".
- `startChat` and issue work from the phone still start on the parent.

## Verified

- Unit: `peerSessions.spec.ts`, `peerEvents.spec.ts`, `test/server/session/activity/task-push-peer.spec.ts`.
- A scratch server from this branch: the route answered 200 / 403 (foreign origin) / 404 (unknown
  command) / 422 (bad session id); pub/sub accepted the peer's origin and refused a foreign one; a
  real `POST /api/hook` Stop reached a subscriber as `peer-push` with push turned off on that server.
- Not yet: the whole path with a phone, which needs both servers on this version.
