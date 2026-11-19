// The peer servers this one relays (common/peers.ts), as the browser may know them: ids and labels.
// Read once per page and shared by every cell; the list only changes when the user edits config.json,
// and a reload picks that up.
import { computed, ref, watch } from "vue";
import { isPeerId, peerApiPath, type PeerSummary } from "../../common/peers";
import { isAgentAccount, type AgentAccount } from "../../common/agentAccounts";
import { sanitizeTokenRotation, type TokenRotation } from "../../common/tokenRotation";
import { isUnknownArray } from "../../common/isUnknownArray";
import type { CwdPreset } from "../components/presets";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { isRecord } from "../../common/isRecord";
import { usePubSub } from "./usePubSub";

export const peerHosts = ref<PeerSummary[]>([]);

let requested = false;

const isSummary = (value: unknown): value is PeerSummary => isRecord(value) && isPeerId(value.id) && typeof value.label === "string";

/** Fetch the list the first time anything asks. An older server has no such route, and an empty
 *  list is exactly what a user with no peers sees, so a failure is not reported. */
export function loadPeerHosts(): void {
  if (requested) return;
  requested = true;
  void (async () => {
    try {
      const res = await fetchWithTimeout("/api/peers");
      if (!res.ok) return;
      const body: unknown = await res.json();
      const list = isRecord(body) ? body.peers : undefined;
      if (Array.isArray(list)) peerHosts.value = list.filter(isSummary);
    } catch {
      // no peers, as above
    }
  })();
}

/** The label a cell's header shows for its peer — the id itself when the list does not (or no
 *  longer) names it, so a cell restored after the entry was removed still says where it points. */
export const peerLabel = (id: string): string => peerHosts.value.find((peer) => peer.id === id)?.label ?? id;

/** Subscribe `callback` to `channel` on EVERY configured peer, and keep that true as the list loads:
 *  for the whole-tab listeners (the attention sound, the favicon) that this server's own stream
 *  feeds, so a peer's sessions reach them the same way. The callback is told which peer spoke, for
 *  anything it then has to ask that server. Returns the way to stop. */
export function subscribeEveryPeer(channel: string, callback: (data: unknown, peer: string) => void): () => void {
  loadPeerHosts();
  const offs = new Map<string, () => void>();
  const stopWatching = watch(
    peerHosts,
    (peers) => {
      const ids = new Set(peers.map((peer) => peer.id));
      for (const [id, off] of offs) {
        if (ids.has(id)) continue;
        off();
        offs.delete(id);
      }
      for (const id of ids)
        if (!offs.has(id))
          offs.set(
            id,
            usePubSub(id).subscribe(channel, (data) => callback(data, id)),
          );
    },
    { immediate: true },
  );
  return () => {
    stopWatching();
    for (const off of offs.values()) off();
    offs.clear();
  };
}

/** What the browser needs from a peer's own `/api/config`: the folders a launch there offers, and
 *  the logins a session there can run on. A peer keeps its OWN accounts and token rotation — its own
 *  `~/.mulmoterminal/config.json`, its own `~/.claude` — so this server's lists name nothing it has. */
export interface PeerConfig {
  presets: CwdPreset[];
  defaultCwd: string | null;
  accounts: AgentAccount[];
  tokenRotation: TokenRotation;
}

export const peerConfigOf = (body: unknown): PeerConfig | null =>
  isRecord(body)
    ? {
        presets: isUnknownArray(body.cwdPresets) ? body.cwdPresets.filter(isCwdPreset) : [],
        defaultCwd: typeof body.cwd === "string" ? body.cwd : null,
        accounts: isUnknownArray(body.accounts) ? body.accounts.filter(isAgentAccount) : [],
        tokenRotation: sanitizeTokenRotation(body.tokenRotation),
      }
    : null;

/** Each peer's config as last read, shared by every cell and form that asks about that peer. */
export const peerConfigs = ref<Readonly<Record<string, PeerConfig>>>({});
const peerConfigAsked = new Map<string, Promise<void>>();

/** Read a peer's config into `peerConfigs`. Once per page unless `fresh` — the launch form asks
 *  fresh each time the peer is picked, so a folder or login added there shows without a reload.
 *  A failure leaves what was held: no chips and no logins is what an unread peer already shows. */
export function loadPeerConfig(id: string, fresh = false): Promise<void> {
  const asked = peerConfigAsked.get(id);
  if (asked && !fresh) return asked;
  const reading = (async () => {
    try {
      const res = await fetchWithTimeout(peerApiPath(id, "/api/config"));
      const config = peerConfigOf(res.ok ? await res.json() : null);
      if (config) peerConfigs.value = { ...peerConfigs.value, [id]: config };
    } catch {
      // as above
    }
  })();
  peerConfigAsked.set(id, reading);
  return reading;
}

/** A peer's own saved directories, default workspace and accounts, for the launch form starting a
 *  session there: the chips must name folders on THAT machine, and the account picked is bound
 *  against THAT server's list — an id from this server's would be ignored there, and the session
 *  would start on the default login with nothing said. Empty while unknown, or for this server
 *  (whose own come in as props); re-read whenever the picked peer changes. */
export function usePeerLaunchDirs(peer: () => string | null) {
  watch(
    peer,
    (id) => {
      if (id) void loadPeerConfig(id, true);
    },
    { immediate: true },
  );
  const config = computed(() => {
    const id = peer();
    return id ? (peerConfigs.value[id] ?? null) : null;
  });
  return {
    presets: computed(() => config.value?.presets ?? []),
    defaultCwd: computed(() => config.value?.defaultCwd ?? null),
    accounts: computed(() => config.value?.accounts ?? []),
  };
}

const isCwdPreset = (value: unknown): value is CwdPreset => isRecord(value) && typeof value.label === "string" && typeof value.path === "string";

// Which peer each session open in the grid runs on (common/peers.ts). Session ids are UUIDs, so one
// map serves every server; a session absent from it is this server's. Kept by GridView from its cells,
// for the helpers that are handed a session id alone and must ask the server that holds it — the
// question pane's read and answer, a checklist's read and close.
const sessionHosts = new Map<string, string>();

/** Keep the map in step with the grid's cells, for as long as the caller's scope lives. */
export function watchSessionHosts(cells: () => readonly { session: string | null; host?: string | undefined }[]): void {
  watch(
    () => cells().flatMap((c) => (c.session && c.host ? [[c.session, c.host] as const] : [])),
    (entries) => {
      sessionHosts.clear();
      for (const [session, host] of entries) sessionHosts.set(session, host);
    },
    { immediate: true },
  );
}

/** The peer `sessionId` runs on, or null for this server. */
export const sessionHostOf = (sessionId: string): string | null => sessionHosts.get(sessionId) ?? null;

// Which peers answered the last time this server asked (GET /api/peers/status), for a peer cell to
// say its server is down rather than look like a terminal that is merely slow to reconnect. A peer
// absent from the map has not been asked yet and reads as fine. Asked while the tab is visible and
// only when there are peers at all.
export const peerReachable = ref<ReadonlyMap<string, boolean>>(new Map());
const REACHABILITY_POLL_MS = 15_000;
let polling = false;

async function refreshPeerReachability(): Promise<void> {
  try {
    const res = await fetchWithTimeout("/api/peers/status");
    const body: unknown = res.ok ? await res.json() : null;
    const list = isRecord(body) && isUnknownArray(body.peers) ? body.peers : [];
    peerReachable.value = new Map(
      list.flatMap((row) => (isRecord(row) && isPeerId(row.id) && typeof row.reachable === "boolean" ? [[row.id, row.reachable] as const] : [])),
    );
  } catch {
    // Unknown is fine: nothing is marked down on a failed ask.
  }
}

/** Start watching the peers' reachability, once per page, as soon as there is a peer to watch. */
export function watchPeerReachability(): void {
  if (polling) return;
  polling = true;
  loadPeerHosts();
  watch(
    peerHosts,
    (list) => {
      if (list.length) void refreshPeerReachability();
    },
    { immediate: true },
  );
  setInterval(() => {
    if (peerHosts.value.length && document.visibilityState === "visible") void refreshPeerReachability();
  }, REACHABILITY_POLL_MS);
}

/** Whether the peer is known to be down: true only on a "no" from the last ask. */
export const peerIsDown = (id: string): boolean => peerReachable.value.get(id) === false;
