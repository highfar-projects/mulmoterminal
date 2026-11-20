// The parent calling a peer's PEER_COMMAND_PATH (peerProtocol.ts). The request carries the peer's
// own origin, as the browser relay's does (infra/http/peer-proxy.ts): to the peer, this server is
// its page. That is only safe because nothing a phone or a page sends chooses the URL — the peer
// is named by id and resolved against config.json, which only the user writes.
import { coerceJsonObject, type JsonObject, type JsonValue } from "@mulmoclaude/core/remote-host";
import type { PeerHost } from "../../../common/peers.js";
import { isRecord } from "../../../common/isRecord.js";
import { PEER_COMMAND_PATH } from "./peerProtocol.js";

// Longer than any one screen or transcript read takes on a working machine, shorter than the
// phone's own patience with a command — a peer that does not answer must not hold the list.
const PEER_COMMAND_TIMEOUT_MS = 10_000;

export async function callPeerCommand(peer: PeerHost, name: string, params: JsonObject): Promise<JsonValue> {
  const origin = new URL(peer.url).origin;
  let res: Response;
  try {
    res = await fetch(new URL(PEER_COMMAND_PATH, peer.url), {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ name, params }),
      signal: AbortSignal.timeout(PEER_COMMAND_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${peer.label} is not reachable.`);
  }
  const body: unknown = await res.json().catch(() => null);
  // Rebuilt from what was actually inspected rather than asserted: this is another process's word.
  if (res.ok && isRecord(body) && "result" in body) return coerceJsonObject(body).result ?? null;
  // A peer that predates the route answers 404 with no `error` of ours.
  const reason = isRecord(body) && typeof body.error === "string" ? body.error : `${peer.label} answered HTTP ${res.status}.`;
  throw new Error(reason);
}
