// The peer servers this one relays (common/peers.ts), as the browser may know them: ids and labels.
// Read once per page and shared by every cell; the list only changes when the user edits config.json,
// and a reload picks that up.
import { ref, watch } from "vue";
import { isPeerId, peerApiPath, type PeerSummary } from "../../common/peers";
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

/** A peer's own saved directories and default workspace (its `/api/config`), for the launch form
 *  starting a session there: the chips must name folders on THAT machine. Empty while unknown, or
 *  for this server (whose own come in as props); re-read whenever the picked peer changes. */
export function usePeerLaunchDirs(peer: () => string | null) {
  const presets = ref<CwdPreset[]>([]);
  const defaultCwd = ref<string | null>(null);
  let asked = 0;
  watch(
    peer,
    async (id) => {
      const my = ++asked;
      presets.value = [];
      defaultCwd.value = null;
      if (!id) return;
      try {
        const res = await fetchWithTimeout(peerApiPath(id, "/api/config"));
        const body: unknown = res.ok ? await res.json() : null;
        if (my !== asked || !isRecord(body)) return;
        presets.value = isUnknownArray(body.cwdPresets) ? body.cwdPresets.filter(isCwdPreset) : [];
        defaultCwd.value = typeof body.cwd === "string" ? body.cwd : null;
      } catch {
        // No chips: the field still takes a typed path.
      }
    },
    { immediate: true },
  );
  return { presets, defaultCwd };
}

const isCwdPreset = (value: unknown): value is CwdPreset => isRecord(value) && typeof value.label === "string" && typeof value.path === "string";
