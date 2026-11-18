// @vitest-environment node
// The relay end to end: a real peer server on a loopback port, a real relay in front of it, and
// requests made the way a browser makes them — so what is pinned is what reaches the peer.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { attachPeerUpgradeRelay, mountPeerHttpRelay, peerRequestHeaders, relayAllowed } from "../../../../server/infra/http/peer-proxy";
import type { PeerHost } from "../../../../common/peers";

const listen = (server: http.Server): Promise<number> =>
  new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));

let peerServer: http.Server;
let relayServer: http.Server;
let relayPort = 0;
let peerUrl = "";
const seen: Array<{
  url: string;
  method: string;
  host: string | undefined;
  origin: string | undefined;
  referer: string | undefined;
  prefix: string | undefined;
  body: string;
}> = [];

// Our own page's origin, as the relay's guard would see it.
const OURS = "http://ours.test";
const isAllowedOrigin = (origin: string | undefined) => origin === OURS;

beforeAll(async () => {
  peerServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const prefix = req.headers["x-forwarded-prefix"];
      seen.push({
        url: req.url ?? "",
        method: req.method ?? "",
        host: req.headers.host,
        origin: req.headers.origin,
        referer: req.headers.referer,
        prefix: typeof prefix === "string" ? prefix : undefined,
        body,
      });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ path: req.url }));
    });
  });
  // The peer's terminal socket: refuses a foreign Origin, as a real MulmoTerminal does, and echoes.
  const wss = new WebSocketServer({ noServer: true });
  peerServer.on("upgrade", (req, socket, head) => {
    if (req.headers.origin !== peerUrl) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => ws.on("message", (data) => ws.send(`echo:${req.url}:${data.toString()}`)));
  });
  peerUrl = `http://127.0.0.1:${await listen(peerServer)}`;

  const peers = (): PeerHost[] => [{ id: "win", label: "Windows", url: peerUrl }];
  const app = express();
  mountPeerHttpRelay(app, isAllowedOrigin, peers);
  relayServer = http.createServer(app);
  attachPeerUpgradeRelay([relayServer], isAllowedOrigin, peers);
  relayPort = await listen(relayServer);
});

afterAll(() => {
  relayServer.closeAllConnections();
  peerServer.closeAllConnections();
  relayServer.close();
  peerServer.close();
});

const relay = (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${relayPort}${path}`, init);

describe("the HTTP relay", () => {
  it("lists the peers by id and label, without their urls", async () => {
    expect(await (await relay("/api/peers")).json()).toEqual({ peers: [{ id: "win", label: "Windows" }] });
  });

  it("asks the peer for the path after the prefix, as the peer's own host", async () => {
    seen.length = 0;
    const res = await relay("/peer/win/api/sessions?x=1");
    expect(await res.json()).toEqual({ path: "/api/sessions?x=1" });
    expect(seen[0]?.host).toBe(new URL(peerUrl).host);
  });

  it("forwards a state-changing request from our own page with its body, as the peer's origin", async () => {
    seen.length = 0;
    const res = await relay("/peer/win/api/thing", {
      method: "POST",
      headers: { origin: OURS, referer: `${OURS}/grid`, "content-type": "application/json" },
      body: '{"a":1}',
    });
    expect(res.status).toBe(200);
    expect(seen[0]).toMatchObject({ method: "POST", origin: peerUrl, body: '{"a":1}' });
    expect(seen[0]?.referer).toBeUndefined();
  });

  // The rewrite is what earns the peer's trust, so the browser's real Origin is judged first.
  it("refuses a state-changing request from another site before the peer sees it", async () => {
    seen.length = 0;
    const res = await relay("/peer/win/api/thing", { method: "POST", headers: { origin: "http://evil.test" }, body: "{}" });
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  // So a page the peer renders links its own images and modules back through this relay — and a
  // browser cannot make the peer believe it is mounted somewhere else.
  it("tells the peer where it is mounted, replacing whatever the browser sent", async () => {
    seen.length = 0;
    await relay("/peer/win/api/files/browse/md?path=a.md", { headers: { "x-forwarded-prefix": "/peer/evil" } });
    expect(seen[0]?.prefix).toBe("/peer/win");
  });

  it("answers 404 for a peer that is not configured", async () => {
    expect((await relay("/peer/mac/api/sessions")).status).toBe(404);
  });
});

const openThroughRelay = (path: string, origin: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${relayPort}${path}`, { origin });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });

describe("the WebSocket relay", () => {
  it("connects our page to the peer's socket and carries frames both ways", async () => {
    const ws = await openThroughRelay("/peer/win/ws?session=abc", OURS);
    const reply = new Promise<string>((resolve) => ws.once("message", (data) => resolve(data.toString())));
    ws.send("hello");
    expect(await reply).toBe("echo:/ws?session=abc:hello");
    ws.close();
  });

  it("refuses an upgrade from another site", async () => {
    await expect(openThroughRelay("/peer/win/ws", "http://evil.test")).rejects.toThrow();
  });

  it("refuses an upgrade for a peer that is not configured", async () => {
    await expect(openThroughRelay("/peer/mac/ws", OURS)).rejects.toThrow();
  });
});

describe("peerRequestHeaders", () => {
  it("drops hop-by-hop headers from a plain request and keeps them on an upgrade", () => {
    const headers = { connection: "upgrade", upgrade: "websocket", "keep-alive": "5", host: "x", "sec-websocket-key": "k" };
    expect(peerRequestHeaders(headers, "http://127.0.0.1:9", { upgrade: false })).toEqual({ host: "127.0.0.1:9", "sec-websocket-key": "k" });
    expect(peerRequestHeaders(headers, "http://127.0.0.1:9", { upgrade: true })).toMatchObject({
      connection: "upgrade",
      upgrade: "websocket",
      host: "127.0.0.1:9",
    });
  });

  it("sets an Origin only where the browser sent one", () => {
    expect(peerRequestHeaders({}, "http://127.0.0.1:9", { upgrade: false }).origin).toBeUndefined();
  });
});

describe("relayAllowed", () => {
  it("lets a safe request with no Origin through, as the peer's own guard would", () => {
    expect(relayAllowed("GET", undefined, "127.0.0.1", isAllowedOrigin)).toBe(true);
  });

  it("refuses a safe request carrying another site's Origin", () => {
    expect(relayAllowed("GET", "http://evil.test", "127.0.0.1", isAllowedOrigin)).toBe(false);
  });

  it("refuses a state-changing request with no Origin", () => {
    expect(relayAllowed("POST", undefined, "127.0.0.1", isAllowedOrigin)).toBe(false);
  });
});
