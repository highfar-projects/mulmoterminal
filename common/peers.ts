import { isRecord } from "./isRecord.js";

// Other MulmoTerminal servers whose cells this one can show in its own tab — a PEER. The first use is
// a Windows machine running two servers, one in WSL and one native, viewed from one browser tab.
//
// This server RELAYS a peer: the browser asks for `/peer/<id>/ws?…` here, and the request is handed to
// the peer as `/ws?…`. So the page stays same-origin with this server, and neither server has to relax
// its origin check or speak CORS.
//
// Peers are declared in `~/.mulmoterminal/config.json` and NOWHERE ELSE. Relaying hands the browser
// full control of the peer machine, so a peer is a decision the user writes in a file, never a URL
// a page can send: the browser names a peer by id, and the server resolves the id against this list,
// the same way a launcher index or a custom agent id is resolved.
//
//   "peers": [{ "id": "win", "label": "Windows", "url": "http://127.0.0.1:34568" }]

/** A configured peer. `url` is its origin: scheme, host and port, nothing after. */
export interface PeerHost {
  id: string;
  label: string;
  url: string;
}

/** What the browser is told about a peer. The url stays on the server: the browser never needs it,
 *  and not sending it keeps "which machine" a server-side decision. */
export interface PeerSummary {
  id: string;
  label: string;
}

// Short, and safe in a URL path segment and a CSS-free label: it is shown on every cell that runs there.
const PEER_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const isPeerId = (value: unknown): value is string => typeof value === "string" && PEER_ID_RE.test(value);

const LABEL_MAX = 40;

/** The peer's origin, or null for anything that is not a plain http(s) origin. A path, a query or
 *  credentials in the url would be silently dropped or, worse, sent along, so they are refused. */
function peerOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

/** The configured list, keeping every well-formed entry and the first of any repeated id. Anything
 *  else reads as "no peers": the feature is off unless the user wrote it. */
export function sanitizePeers(input: unknown): PeerHost[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const peers: PeerHost[] = [];
  for (const entry of input) {
    if (!isRecord(entry)) continue;
    const { id, label, url } = entry;
    const origin = peerOrigin(url);
    if (!isPeerId(id) || origin === null || seen.has(id)) continue;
    seen.add(id);
    const shown = typeof label === "string" && label.trim() ? label.trim().slice(0, LABEL_MAX) : id;
    peers.push({ id, label: shown, url: origin });
  }
  return peers;
}

export const PEER_PATH_PREFIX = "/peer/";

/** `/peer/<id>/rest?q` → the peer and the path to ask it for; null for a path that is not a peer's. */
export function splitPeerPath(pathWithQuery: string): { id: string; rest: string } | null {
  if (!pathWithQuery.startsWith(PEER_PATH_PREFIX)) return null;
  const after = pathWithQuery.slice(PEER_PATH_PREFIX.length);
  const slash = after.indexOf("/");
  if (slash <= 0) return null;
  const id = after.slice(0, slash);
  if (!isPeerId(id)) return null;
  return { id, rest: after.slice(slash) };
}

/** The `host` a browser builds a WebSocket url on for a cell: this server's, or this server's with
 *  the peer's prefix after it — every endpoint builder writes `${proto}//${host}/${path}`, so the
 *  prefix reaches all of them without each learning about peers. */
export const peerWsHost = (peer: string | null | undefined, locationHost: string): string =>
  peer ? `${locationHost}${PEER_PATH_PREFIX}${peer}` : locationHost;
