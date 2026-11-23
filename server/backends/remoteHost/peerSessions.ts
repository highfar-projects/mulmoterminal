// The parent's half of reaching a peer's cells from the phone (peerProtocol.ts says why).
//
// Wraps the handler table the Firestore runner serves: `listTerminalSessions` gains every
// reachable peer's rows, and a session-scoped command whose session is not ours goes to the peer
// that listed it. Everything else is untouched, so a host with no peers behaves exactly as before.
import { toJsonObject, type CommandHandler, type CommandHandlers, type JsonObject, type JsonValue } from "@mulmoclaude/core/remote-host";
import type { PeerHost } from "../../../common/peers.js";
import { isRecord } from "../../../common/isRecord.js";
import { DIR_ICONS_MAX_CHARS } from "./dirIcons.js";
import { PEER_COMMANDS, PEER_SESSION_COMMANDS } from "./peerProtocol.js";

export interface PeerSessionDeps {
  /** The peers configured right now (config.json's `peers`), read per command. */
  peers: () => PeerHost[];
  /** Run `name` on that peer's PEER_COMMAND_PATH. Rejects with the peer's own refusal. */
  call: (peer: PeerHost, name: string, params: JsonObject) => Promise<JsonValue>;
  /** Whether THIS server holds the session — the same test the local handlers make. */
  isLocal: (sessionId: string) => Promise<boolean>;
  warn: (message: string) => void;
}

interface Listing {
  sessions: JsonObject[];
  icons: Record<string, string>;
}

const listingOf = (value: JsonValue): Listing => {
  const record = isRecord(value) ? value : {};
  const sessions = Array.isArray(record.sessions) ? record.sessions.filter((row): row is JsonObject => isRecord(row)) : [];
  const icons: Record<string, string> = {};
  if (isRecord(record.icons)) for (const [id, src] of Object.entries(record.icons)) if (typeof src === "string") icons[id] = src;
  return { sessions, icons };
};

const iconChars = (icons: Record<string, string>): number => Object.values(icons).reduce((sum, src) => sum + src.length, 0);

/** A peer's row as the phone should see it: its title says which server it runs on, since the
 *  phone has no other column for that. */
const peerRow = (row: JsonObject, peer: PeerHost): JsonObject => {
  const title = typeof row.title === "string" && row.title ? `[${peer.label}] ${row.title}` : `[${peer.label}]`;
  return { ...row, title };
};

/** Fold a peer's listing into ours. Its icons join the table only while the whole table stays
 *  under the one budget the local listing is already held to — the reply is a Firestore document
 *  with a 1 MiB ceiling — and a row whose icon did not fit loses the reference, which the phone
 *  answers with its plain glyph (dirIcons.ts). */
export function mergeListing(into: Listing, peerListing: Listing, peer: PeerHost): void {
  let budget = DIR_ICONS_MAX_CHARS - iconChars(into.icons);
  for (const [id, src] of Object.entries(peerListing.icons)) {
    if (id in into.icons) continue; // icon ids are content hashes: the same id is the same image
    if (src.length > budget) continue;
    into.icons[id] = src;
    budget -= src.length;
  }
  for (const row of peerListing.sessions) {
    const kept =
      typeof row.iconId === "string" && !(row.iconId in into.icons) ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== "iconId")) : row;
    into.sessions.push(peerRow(kept, peer));
  }
}

/** What this server answers a relaying parent on PEER_COMMAND_PATH: the PEER_COMMANDS of its own,
 *  unwrapped table — the one the phone is served before withPeerSessions — and nothing else. */
export const peerCommandTable = (own: CommandHandlers): CommandHandlers =>
  Object.fromEntries(Object.entries(own).filter(([name]) => PEER_COMMANDS.includes(name)));

const sessionIdParam = (params: JsonObject): string | null => (typeof params.sessionId === "string" && params.sessionId ? params.sessionId : null);

export function withPeerSessions(handlers: CommandHandlers, deps: PeerSessionDeps): CommandHandlers {
  // Which peer listed which session, as of its last listing. A tap on a notification names a
  // session before any list was asked for, so a miss refreshes this rather than giving up.
  const owners = new Map<string, string>();

  const listPeer = async (peer: PeerHost): Promise<Listing | null> => {
    try {
      const listing = listingOf(await deps.call(peer, "listTerminalSessions", {}));
      for (const row of listing.sessions) if (typeof row.id === "string") owners.set(row.id, peer.id);
      return listing;
    } catch (err) {
      deps.warn(`[remote-host] peer ${peer.id} did not list its sessions: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  const ownerOf = async (sessionId: string): Promise<PeerHost | null> => {
    const peers = deps.peers();
    const known = peers.find((peer) => peer.id === owners.get(sessionId));
    if (known) return known;
    await Promise.all(peers.map(listPeer));
    return peers.find((peer) => peer.id === owners.get(sessionId)) ?? null;
  };

  const local = (name: string): CommandHandler => {
    const handler = handlers[name];
    if (!handler) throw new Error(`no handler for ${name}`);
    return handler;
  };

  const listTerminalSessions: CommandHandler = async (params) => {
    const own = listingOf(await local("listTerminalSessions")(params));
    const peers = deps.peers();
    if (peers.length === 0) return toJsonObject(own);
    const listings = await Promise.all(peers.map(listPeer));
    peers.forEach((peer, i) => {
      const listing = listings[i];
      if (listing) mergeListing(own, listing, peer);
    });
    return toJsonObject(own);
  };

  const routed =
    (name: string): CommandHandler =>
    async (params) => {
      const sessionId = sessionIdParam(params);
      // Ours, or no session named at all: the local handler answers, refusals included.
      if (!sessionId || deps.peers().length === 0 || (await deps.isLocal(sessionId))) return local(name)(params);
      const peer = await ownerOf(sessionId);
      return peer ? deps.call(peer, name, params) : local(name)(params);
    };

  const wrapped: CommandHandlers = { ...handlers, listTerminalSessions };
  for (const name of PEER_SESSION_COMMANDS) if (handlers[name]) wrapped[name] = routed(name);
  return wrapped;
}
