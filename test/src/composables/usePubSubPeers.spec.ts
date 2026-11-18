// One socket per server (common/peers.ts): a peer's channels are that server's own, reached at
// `/peer/<id>/ws/pubsub` through this server's relay, and never mixed with this server's stream.
import { describe, it, expect, vi } from "vitest";

interface FakeSocket {
  path: string;
  handlers: Map<string, (arg: unknown) => void>;
  emitted: string[];
}
const sockets = vi.hoisted((): FakeSocket[] => []);
vi.mock("socket.io-client", () => ({
  io: (opts: { path: string }) => {
    const s: FakeSocket = { path: opts.path, handlers: new Map(), emitted: [] };
    sockets.push(s);
    return {
      on: (event: string, handler: (arg: unknown) => void) => s.handlers.set(event, handler),
      emit: (event: string, channel: string) => s.emitted.push(`${event}:${channel}`),
      connected: false,
    };
  },
}));

import { usePubSub } from "../../../src/composables/usePubSub";

const socketAt = (path: string): FakeSocket => {
  const s = sockets.find((x) => x.path === path);
  if (!s) throw new Error(`no socket at ${path}`);
  return s;
};

describe("usePubSub per server", () => {
  it("opens this server's socket and each peer's at its relayed path, once each", () => {
    usePubSub().subscribe("sessions", () => {});
    usePubSub("win").subscribe("sessions", () => {});
    usePubSub("win").subscribe("dir-config", () => {});
    expect(sockets.map((s) => s.path).sort()).toEqual(["/peer/win/ws/pubsub", "/ws/pubsub"]);
  });

  it("delivers a peer's message to that peer's subscribers only", () => {
    const here: unknown[] = [];
    const there: unknown[] = [];
    usePubSub().subscribe("sessions", (d) => here.push(d));
    usePubSub("mac").subscribe("sessions", (d) => there.push(d));
    socketAt("/peer/mac/ws/pubsub").handlers.get("data")?.({ channel: "sessions", data: { id: "on-mac" } });
    expect(there).toEqual([{ id: "on-mac" }]);
    expect(here).toEqual([]);
  });

  it("re-joins a peer's rooms on that peer's socket when it connects", () => {
    usePubSub("box").subscribe("sessions", () => {});
    const s = socketAt("/peer/box/ws/pubsub");
    s.handlers.get("connect")?.(undefined);
    expect(s.emitted).toContain("subscribe:sessions");
  });
});
