import { io, type Socket } from "socket.io-client";
import { PEER_PATH_PREFIX } from "../../common/peers";

// Minimal pub/sub client, modeled on mulmoclaude's usePubSub. A single shared
// socket multiplexes every channel; subscriptions are replayed on reconnect.
//
// One socket per SERVER: this one, and each peer it relays (common/peers.ts). A peer's channels are
// that server's own — its `sessions` stream is about the sessions running THERE — so a cell on a
// peer subscribes through `usePubSub(peerId)`, which reaches the peer's socket.io at
// `/peer/<id>/ws/pubsub` through this server's relay. `usePubSub()` is this server, as before.
interface PubSubMessage {
  channel: string;
  data: unknown;
}

type Callback = (data: unknown) => void;
type Unsubscribe = () => void;

interface Hub {
  path: string;
  socket: Socket | null;
  listeners: Map<string, Set<Callback>>;
  // Fired on every RE-connect (not the first connect). A subscriber that holds derived
  // state — e.g. the notification list — re-syncs here, since pubsub only replays room
  // membership on reconnect, not the events missed while disconnected.
  reconnectListeners: Set<() => void>;
  // Fired on EVERY connect, the FIRST one included. `onReconnect` deliberately skips the first —
  // state derived from the stream has nothing to re-sync before the stream has ever run — but a
  // consumer whose state predates the socket does have something to check: the collection pane files
  // a chat the moment it is spawned, which can be before this socket has ever come up, and an ending
  // in that window is pushed to nobody (#2001).
  connectListeners: Set<() => void>;
  hasConnected: boolean;
}

const hubs = new Map<string, Hub>();

function hubFor(host: string | null): Hub {
  const key = host ?? "";
  let hub = hubs.get(key);
  if (!hub) {
    hub = {
      path: host ? `${PEER_PATH_PREFIX}${host}/ws/pubsub` : "/ws/pubsub",
      socket: null,
      listeners: new Map(),
      reconnectListeners: new Set(),
      connectListeners: new Set(),
      hasConnected: false,
    };
    hubs.set(key, hub);
  }
  return hub;
}

function connect(hub: Hub): Socket {
  if (hub.socket) return hub.socket;

  const sock = io({ path: hub.path, transports: ["websocket"] });

  // Re-emit every live subscription so rooms survive a reconnect.
  sock.on("connect", () => {
    for (const channel of hub.listeners.keys()) sock.emit("subscribe", channel);
    if (hub.hasConnected) for (const cb of hub.reconnectListeners) cb();
    for (const cb of hub.connectListeners) cb();
    hub.hasConnected = true;
  });

  sock.on("data", (msg: PubSubMessage) => {
    const cbs = hub.listeners.get(msg.channel);
    if (cbs) for (const handler of cbs) handler(msg.data);
  });

  hub.socket = sock;
  return sock;
}

/** @param host the peer server whose channels these are (common/peers.ts), or null/absent for this one. */
export function usePubSub(host: string | null = null) {
  const hub = hubFor(host);

  function subscribe(channel: string, callback: Callback): Unsubscribe {
    let entry = hub.listeners.get(channel);
    if (!entry) {
      entry = new Set();
      hub.listeners.set(channel, entry);
    }
    entry.add(callback);

    const sock = connect(hub);
    if (sock.connected) sock.emit("subscribe", channel);

    return () => {
      const cbs = hub.listeners.get(channel);
      if (!cbs) return;
      cbs.delete(callback);
      if (cbs.size === 0) {
        hub.listeners.delete(channel);
        if (hub.socket?.connected) hub.socket.emit("unsubscribe", channel);
      }
    };
  }

  // Register a callback fired on every reconnect (not the first connect). Returns an
  // unsubscribe. Lets a consumer re-fetch authoritative state after a dropped socket.
  function onReconnect(callback: () => void): Unsubscribe {
    hub.reconnectListeners.add(callback);
    connect(hub);
    return () => hub.reconnectListeners.delete(callback);
  }

  /** Register a callback fired on every connect, the first included. Returns an unsubscribe.
   *  For state that exists BEFORE the socket does and has to be checked once it is up. */
  function onConnect(callback: () => void): Unsubscribe {
    hub.connectListeners.add(callback);
    connect(hub);
    return () => hub.connectListeners.delete(callback);
  }

  return { subscribe, onReconnect, onConnect };
}
