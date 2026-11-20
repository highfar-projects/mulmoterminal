// The parent listening to each peer's pub/sub (peerProtocol.ts): the pushes a peer would have sent,
// and its sessions' status, which the phone's list draws its working / waiting dots from.
//
// The same socket the browser opens to a peer through the relay, opened here directly: the peer's
// own origin is sent, as the HTTP relay does, which is safe for the reason peerClient.ts gives.
// Reconciled against config.json on a timer, so a peer added or removed needs no restart.
import { io, type Socket } from "socket.io-client";
import type { PeerHost } from "../../../common/peers.js";
import { isRecord } from "../../../common/isRecord.js";
import { isPeerPushEvent, PEER_PUSH_CHANNEL, type PeerPushEvent } from "./peerProtocol.js";

export interface PeerSessionStatus {
  id: string;
  working: boolean;
  waiting: boolean;
  event: string | null;
}

export interface PeerEventDeps {
  peers: () => PeerHost[];
  /** The peer's session row channel (session/lifecycle.ts SESSIONS_CHANNEL). */
  sessionsChannel: string;
  onPush: (peer: PeerHost, event: PeerPushEvent) => void;
  onSessionStatus: (peer: PeerHost, status: PeerSessionStatus) => void;
}

const RECONCILE_MS = 30_000;

export const peerSessionStatusOf = (value: unknown): PeerSessionStatus | null => {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const { id, working, waiting, event } = value;
  return { id, working: working === true, waiting: waiting === true, event: typeof event === "string" ? event : null };
};

/** Starts listening; returns the way to stop. */
export function startPeerEventRelay(deps: PeerEventDeps): () => void {
  const sockets = new Map<string, { url: string; socket: Socket }>();

  const connect = (peer: PeerHost): Socket => {
    const origin = new URL(peer.url).origin;
    const socket = io(origin, { path: "/ws/pubsub", transports: ["websocket"], extraHeaders: { origin } });
    // Re-subscribed on every (re)connect: a peer that restarted has forgotten its rooms.
    socket.on("connect", () => {
      socket.emit("subscribe", PEER_PUSH_CHANNEL);
      socket.emit("subscribe", deps.sessionsChannel);
    });
    socket.on("data", (message: unknown) => {
      if (!isRecord(message)) return;
      if (message.channel === PEER_PUSH_CHANNEL && isPeerPushEvent(message.data)) deps.onPush(peer, message.data);
      else if (message.channel === deps.sessionsChannel) {
        const status = peerSessionStatusOf(message.data);
        if (status) deps.onSessionStatus(peer, status);
      }
    });
    return socket;
  };

  const reconcile = (): void => {
    const peers = deps.peers();
    for (const [id, entry] of sockets) {
      if (peers.some((peer) => peer.id === id && peer.url === entry.url)) continue;
      entry.socket.close();
      sockets.delete(id);
    }
    for (const peer of peers) if (!sockets.has(peer.id)) sockets.set(peer.id, { url: peer.url, socket: connect(peer) });
  };

  reconcile();
  const timer = setInterval(reconcile, RECONCILE_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    for (const entry of sockets.values()) entry.socket.close();
    sockets.clear();
  };
}
