// Relay a PEER server (common/peers.ts): `/peer/<id>/…` here is `/…` on the peer, for plain HTTP
// and for WebSocket upgrades alike, so one browser tab can hold cells that run on another
// MulmoTerminal server — the WSL one and the Windows one, side by side.
//
// What this relay is trusted with, and therefore what it checks itself:
//
// - The peer's own origin guard is satisfied by REWRITING `Origin` (and `Host`) to the peer's: the
//   peer sees a same-origin request, because to it, this server is the page. That only stays safe
//   because THIS server applies its own guard first, with the browser's real Origin — a page on
//   another site that could reach this relay would otherwise inherit the peer's trust.
// - A peer is named by id and resolved against `peers` in config.json, which only the user writes
//   (the config POST keeps unknown keys from the FILE, never from the request). No URL a page sends
//   is ever dialled.
//
// The WebSocket relay does not decode frames: once the peer answers 101, the two sockets are piped
// to each other byte for byte, so every terminal endpoint (/ws, /ws/codex, /ws/launch, …) works
// through it without this module knowing what any of them say.
import http, { type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import https from "node:https";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Duplex } from "node:stream";
import type { Express, Request, Response } from "express";
import { PEER_PATH_PREFIX, sanitizePeers, splitPeerPath, type PeerHost, type PeerSummary } from "../../../common/peers.js";
import { MULMOTERMINAL_HOME } from "../../config/env.js";
import { messageOf } from "../../errors.js";
import { isRecord } from "../../../common/isRecord.js";

type OriginPredicate = (origin: string | undefined, remoteAddress: string | undefined) => boolean;
export type PeerSource = () => PeerHost[];

const CONFIG_FILE = path.join(MULMOTERMINAL_HOME, "config.json");

// Read from the file each time it changed, not once at boot: adding a peer should not need a
// restart, and the in-memory AppConfig deliberately does not carry this key (the browser could
// otherwise round-trip it through the config POST).
let cached: { mtimeMs: number; peers: PeerHost[] } | null = null;
export const configuredPeers: PeerSource = () => {
  try {
    const { mtimeMs } = statSync(CONFIG_FILE);
    if (cached?.mtimeMs === mtimeMs) return cached.peers;
    const parsed: unknown = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    const peers = sanitizePeers(isRecord(parsed) ? parsed.peers : undefined);
    cached = { mtimeMs, peers };
    return peers;
  } catch {
    return []; // no config, or one that does not parse: no peers, which is the default
  }
};

/** The browser's view of the list: ids and labels, never the urls. */
export const peerSummaries = (peers: PeerHost[]): PeerSummary[] => peers.map(({ id, label }) => ({ id, label }));

// Hop-by-hop headers (RFC 9110 §7.6.1) describe ONE connection, so they are not forwarded on a
// plain request. An upgrade keeps `connection` and `upgrade`: they are the request.
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade"];

/** The headers the peer is sent: the browser's, with `Host` and `Origin` saying the peer's own
 *  origin (see the header comment for why that is safe here) and `Referer` dropped, since it names
 *  this server's page and means nothing to the peer. */
export function peerRequestHeaders(headers: IncomingHttpHeaders, peerUrl: string, { upgrade }: { upgrade: boolean }): IncomingHttpHeaders {
  const dropped = new Set(["referer", ...(upgrade ? [] : HOP_BY_HOP)]);
  const out: IncomingHttpHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => !dropped.has(name)));
  out.host = new URL(peerUrl).host;
  if (headers.origin !== undefined) out.origin = peerUrl;
  return out;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** This server's own guard, asked with the browser's real Origin before the relay rewrites it. A
 *  state-changing method must come from this server's page; a safe one is let through as the
 *  peer's own guard would let it through, unless it carries an Origin that is not ours. */
export function relayAllowed(method: string, origin: string | undefined, remoteAddress: string | undefined, isAllowedOrigin: OriginPredicate): boolean {
  if (SAFE_METHODS.has(method.toUpperCase()) && origin === undefined) return true;
  return isAllowedOrigin(origin, remoteAddress);
}

const clientFor = (url: URL) => (url.protocol === "https:" ? https : http);

/** `/api/peers` and the HTTP half of the relay. Mounted BEFORE any body parser: the request body is
 *  streamed to the peer untouched, and a parser that ran first would have consumed it. */
export function mountPeerHttpRelay(app: Express, isAllowedOrigin: OriginPredicate, peers: PeerSource = configuredPeers): void {
  app.get("/api/peers", (_req, res) => {
    res.json({ peers: peerSummaries(peers()) });
  });

  app.use(PEER_PATH_PREFIX.slice(0, -1), (req: Request, res: Response) => {
    const split = splitPeerPath(req.originalUrl);
    const peer = split ? peers().find((p) => p.id === split.id) : undefined;
    if (!split || !peer) {
      res.status(404).json({ error: "no such peer" });
      return;
    }
    if (!relayAllowed(req.method, req.headers.origin, req.socket.remoteAddress, isAllowedOrigin)) {
      res.status(403).json({ error: "forbidden origin" });
      return;
    }
    const target = new URL(split.rest, peer.url);
    const upstream = clientFor(target).request(
      target,
      { method: req.method, headers: peerRequestHeaders(req.headers, peer.url, { upgrade: false }) },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.statusMessage, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      console.warn(`[peer ${peer.id}] ${req.method} ${split.rest} failed: ${messageOf(err)}`);
      if (!res.headersSent) res.status(502).json({ error: `peer ${peer.label} is not reachable` });
      else res.destroy();
    });
    req.pipe(upstream);
  });
}

/** The 101 the peer sent, re-written to the browser's socket line for line. */
const switchingProtocols = (answer: IncomingMessage): string => {
  const lines = [`HTTP/1.1 101 ${answer.statusMessage ?? "Switching Protocols"}`];
  for (let i = 0; i + 1 < answer.rawHeaders.length; i += 2) lines.push(`${answer.rawHeaders[i]}: ${answer.rawHeaders[i + 1]}`);
  return `${lines.join("\r\n")}\r\n\r\n`;
};

/** The WebSocket half. Leaves every other path alone, so the terminal endpoints and socket.io keep
 *  their own upgrade handlers. */
export function attachPeerUpgradeRelay(servers: readonly http.Server[], isAllowedOrigin: OriginPredicate, peers: PeerSource = configuredPeers): void {
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const split = splitPeerPath(req.url ?? "");
    if (!split) return;
    const peer = peers().find((p) => p.id === split.id);
    // An upgrade always needs our own origin: the same rule the terminal endpoints apply.
    if (!peer || !isAllowedOrigin(req.headers.origin, req.socket.remoteAddress)) {
      if (peer) console.warn(`[peer ${peer.id}] rejected cross-origin upgrade from ${req.headers.origin}`);
      socket.destroy();
      return;
    }
    const target = new URL(split.rest, peer.url);
    const upstream = clientFor(target).request(target, { method: "GET", headers: peerRequestHeaders(req.headers, peer.url, { upgrade: true }) });
    const fail = (why: string) => {
      console.warn(`[peer ${peer.id}] upgrade ${target.pathname} failed: ${why}`);
      socket.destroy();
    };
    upstream.on("upgrade", (answer, peerSocket, peerHead) => {
      socket.write(switchingProtocols(answer));
      if (peerHead.length) socket.write(peerHead);
      if (head.length) peerSocket.write(head);
      const close = () => {
        socket.destroy();
        peerSocket.destroy();
      };
      socket.on("error", close);
      peerSocket.on("error", close);
      socket.on("close", close);
      peerSocket.on("close", close);
      peerSocket.pipe(socket);
      socket.pipe(peerSocket);
    });
    // The peer answered without upgrading — its own guard refused, or the path is not a socket.
    upstream.on("response", (answer) => {
      answer.resume();
      fail(`HTTP ${answer.statusCode}`);
    });
    upstream.on("error", (err) => fail(messageOf(err)));
    socket.on("error", () => upstream.destroy());
    upstream.end();
  };
  servers.forEach((server) => server.on("upgrade", onUpgrade));
}
