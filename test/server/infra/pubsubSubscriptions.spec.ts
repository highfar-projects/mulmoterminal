// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { io as connect, type Socket } from "socket.io-client";
import { createPubSub } from "../../../server/infra/pubsub.js";

// `onSubscriptionChange` is read off socket.io's ROOM lifecycle rather than the subscribe
// handler, and the whole reason is a case no unit test of our own code can show: a tab that
// closes leaves its rooms without ever sending "unsubscribe". So this drives a real server and
// a real client (codex on #2147 — the adapter path was the untested one).

let started: { server: http.Server; sockets: Socket[]; stop: () => void } | null = null;

afterEach(async () => {
  started?.stop();
  started = null;
});

async function listening(): Promise<{ port: number; pubsub: ReturnType<typeof createPubSub>; connectClient: () => Promise<Socket> }> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  const pubsub = createPubSub([server]);
  const sockets: Socket[] = [];
  started = {
    server,
    sockets,
    stop: () => {
      sockets.forEach((socket) => socket.close());
      server.close();
    },
  };
  const connectClient = async (): Promise<Socket> => {
    const socket = connect(`http://127.0.0.1:${address.port}`, { path: "/ws/pubsub", transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    return socket;
  };
  return { port: address.port, pubsub, connectClient };
}

/** Wait for `predicate`, so a test never depends on how many ticks socket.io takes. */
async function until(predicate: () => boolean, label: string, budgetMs = 4000): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("onSubscriptionChange", () => {
  it("reports a channel gaining its first subscriber and losing its last", async () => {
    const { pubsub, connectClient } = await listening();
    const events: string[] = [];
    pubsub.onSubscriptionChange((channel, subscribed) => {
      if (channel === "doc") events.push(subscribed ? "joined" : "left");
    });
    const socket = await connectClient();
    socket.emit("subscribe", "doc");
    await until(() => events.includes("joined"), "the join");
    socket.emit("unsubscribe", "doc");
    await until(() => events.includes("left"), "the leave");
    expect(events).toEqual(["joined", "left"]);
  });

  // The case the subscribe handler cannot see, and the reason this reads the adapter.
  it("reports the last subscriber leaving when the socket just disconnects", async () => {
    const { pubsub, connectClient } = await listening();
    const events: string[] = [];
    pubsub.onSubscriptionChange((channel, subscribed) => {
      if (channel === "doc") events.push(subscribed ? "joined" : "left");
    });
    const socket = await connectClient();
    socket.emit("subscribe", "doc");
    await until(() => events.includes("joined"), "the join");
    socket.close();
    await until(() => events.includes("left"), "the disconnect");
    expect(events).toEqual(["joined", "left"]);
  });

  // Only the FIRST and the LAST: a watcher started per join would be started twice here.
  it("says nothing when a second subscriber joins a channel that already has one", async () => {
    const { pubsub, connectClient } = await listening();
    let joins = 0;
    pubsub.onSubscriptionChange((channel, subscribed) => {
      if (channel === "doc" && subscribed) joins += 1;
    });
    const first = await connectClient();
    first.emit("subscribe", "doc");
    await until(() => joins === 1, "the first join");
    const second = await connectClient();
    second.emit("subscribe", "doc");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(joins).toBe(1);
  });

  it("stops reporting once the listener is removed", async () => {
    const { pubsub, connectClient } = await listening();
    let seen = 0;
    const stop = pubsub.onSubscriptionChange((channel) => {
      if (channel === "doc") seen += 1;
    });
    stop();
    const socket = await connectClient();
    socket.emit("subscribe", "doc");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(seen).toBe(0);
  });
});
