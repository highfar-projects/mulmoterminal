// The phone reaching a PEER's cells (common/peers.ts) through the server it is connected to.
//
// The phone is connected to ONE host: the server whose toolbar signed in. A peer — the WSL server a
// Windows parent relays, typically — is a separate server with its own PTY table and its own hooks,
// and was invisible to the phone: its cells were missing from the list, and its turns sent no push,
// because the peer holds no Firebase session to push with. Connecting the peer as a second host is
// not an answer either: the phone keeps one host per browser, so the user would have to switch.
//
// So the parent stands in for its peers, over two plain channels it already has to them:
//
// - COMMANDS: the parent forwards a session-scoped phone command to the peer's
//   PEER_COMMAND_PATH, which runs the peer's OWN handler for it. Nothing is re-implemented on the
//   parent: what a peer's screen, transcript or input means is still decided where the PTY lives.
// - PUSHES: the peer publishes what it would have pushed on PEER_PUSH_CHANNEL of its pub/sub, and
//   the parent, subscribed to it, sends the push under its own Firebase session and host id.
//
// Session ids are UUIDs minted per server, so a peer's id cannot collide with one of ours: the phone
// is handed them unchanged, and the parent remembers which peer each came from.

import { isRecord } from "../../../common/isRecord.js";

/** Where a peer runs a forwarded phone command. Loopback-and-origin guarded like every POST. */
export const PEER_COMMAND_PATH = "/api/remote-host/peer-command";

/** What a peer publishes when one of its sessions would have sent a push. */
export const PEER_PUSH_CHANNEL = "peer-push";

/** The phone commands that name a session and therefore go to whichever server holds it. Every
 *  one reads `params.sessionId`. `listTerminalSessions` is not here: it names none, and is MERGED
 *  rather than forwarded. */
export const PEER_SESSION_COMMANDS = [
  "getTerminalScreen",
  "getTerminalTranscript",
  "sendTerminalInput",
  "getOpenQuestion",
  "answerQuestion",
  "launchTerminal",
  "listPastSessions",
  "getPastTranscript",
] as const;

/** Every command a peer answers on PEER_COMMAND_PATH. */
export const PEER_COMMANDS: readonly string[] = ["listTerminalSessions", ...PEER_SESSION_COMMANDS];

export interface PeerPushEvent {
  sessionId: string;
  kind: string;
  title: string;
  body: string;
}

const isString = (value: unknown): value is string => typeof value === "string";

export const isPeerPushEvent = (value: unknown): value is PeerPushEvent =>
  isRecord(value) && isString(value.sessionId) && isString(value.kind) && isString(value.title) && isString(value.body);
