import { reactive, watch, onMounted, onUnmounted, type Ref } from "vue";
import { usePubSub } from "./usePubSub";
import { parseSessionActivityPayload, readCellActivity, type CellActivity } from "./sessionActivity";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { peerApiPath } from "../../common/peers";

// Live attention state (working / waiting / event) for a set of grid cell sessions,
// keyed by session id. Unlike the sidebar's /api/sessions list this includes
// dev-terminal (grid) sessions and is NOT capped by the list limit, so an OFF-PAGE
// (unmounted) cell still reports blocked/done — the fix for the grid's cross-page
// attention routing. Seeded from /api/activity (current in-memory state) and kept
// live from the "sessions" pub/sub payload.
//
// A cell on a PEER server (common/peers.ts) is that server's session: `hostOf` names the server for
// each id, and both the seed and the stream are asked of it, through this server's relay. Absent,
// every id is this server's — every caller that has no peer cells.
export function useGridActivity(sessionIds: Ref<string[]>, hostOf: (id: string) => string | null = () => null) {
  const activity = reactive(new Map<string, CellActivity>());

  // Non-null while a seed is in flight, keeping what the channel pushed meanwhile. /api/activity
  // answers as of the moment it was ASKED, so anything after that is newer than the answer
  // and has to go back on top of it — otherwise a cell that just started working is seeded
  // back to idle, and one that just closed reappears (#620 F3).
  let pushedDuringSeed: unknown[] | null = null;
  // Seeds overlap — mount, the cell-list watch and a reconnect all ask. Only the newest
  // answer may be applied: an older one describes a moment that has already been overtaken,
  // and applying it puts back what the newer state replaced.
  let latestSeed = 0;

  function apply(data: unknown): void {
    pushedDuringSeed?.push(data);
    const update = parseSessionActivityPayload(data);
    if (!update) return;
    if ("closed" in update) activity.delete(update.id);
    else activity.set(update.id, update.activity);
  }

  async function seed(): Promise<void> {
    const ids = [...new Set(sessionIds.value.filter(Boolean))];
    if (ids.length === 0) return;
    const seedId = ++latestSeed;
    const pushed: unknown[] = [];
    pushedDuringSeed = pushed;
    try {
      // One ask per server, all at once: each knows only its own sessions.
      const answers = await Promise.all([...idsByHost(ids, hostOf)].map(([host, group]) => seedFrom(host, group)));
      // Overtaken while we waited: this answer is older than what is on screen. Returning
      // also leaves the newer seed's record alone — it is the one that will replay.
      if (seedId !== latestSeed) return;
      // Each row goes through the SAME reader the live channel uses; the seed used to take the
      // whole map as CellActivity on the strength of the annotation alone.
      for (const data of answers) {
        for (const [id, raw] of Object.entries(data)) {
          const a = readCellActivity(raw);
          if (a) activity.set(id, a);
        }
      }
      // Stop recording before replaying, or each replayed update records itself again.
      if (pushedDuringSeed === pushed) pushedDuringSeed = null;
      // In arrival order: a session that went working then closed must end up closed.
      pushed.forEach((update) => apply(update));
    } catch {
      // Transient — the pub/sub stream catches up on the next activity change.
    } finally {
      // A newer seed has taken over: leave its record alone.
      if (pushedDuringSeed === pushed) pushedDuringSeed = null;
    }
  }

  // One subscription per server holding a cell (see serverStreams below).
  const streams = serverStreams(apply, () => void seed());
  const syncStreams = (): void => streams.sync(sessionIds.value.map(hostOf));

  let mounted = false;
  onMounted(() => {
    mounted = true;
    void seed();
    syncStreams();
  });
  onUnmounted(() => {
    mounted = false;
    streams.stopAll();
  });
  // New cells (or a fresh session id after relaunch) need their current state seeded — and a cell on
  // a peer not yet listened to needs that peer's stream.
  watch(sessionIds, () => {
    void seed();
    if (mounted) syncStreams();
  });

  return { activity };
}

function idsByHost(ids: string[], hostOf: (id: string) => string | null): Map<string | null, string[]> {
  const groups = new Map<string | null, string[]>();
  for (const id of ids) {
    const host = hostOf(id);
    groups.set(host, [...(groups.get(host) ?? []), id]);
  }
  return groups;
}

/** One server's answer, or nothing: a server that cannot answer leaves its cells as they are, as a
 *  failed seed always has. */
async function seedFrom(host: string | null, ids: string[]): Promise<Record<string, unknown>> {
  try {
    const res = await fetchWithTimeout(peerApiPath(host, `/api/activity?ids=${encodeURIComponent(ids.join(","))}`));
    return res.ok ? await jsonBody(res) : {};
  } catch {
    return {};
  }
}

/** The `sessions` stream of every server holding a cell — this server's always, as before, and each
 *  peer's while a cell runs there. Keyed by the peer id, "" for this server. */
function serverStreams(onData: (data: unknown) => void, onReconnect: () => void) {
  const streams = new Map<string, () => void>();
  const open = (key: string): (() => void) => {
    const pubsub = usePubSub(key || null);
    const unsubscribe = pubsub.subscribe("sessions", onData);
    // A dropped socket misses pushes; re-seed the authoritative state on reconnect.
    const offReconnect = pubsub.onReconnect(onReconnect);
    return () => {
      unsubscribe();
      offReconnect();
    };
  };
  return {
    sync(hosts: (string | null)[]): void {
      const wanted = new Set<string>(["", ...hosts.filter((h): h is string => !!h)]);
      for (const [key, stop] of streams) {
        if (wanted.has(key)) continue;
        stop();
        streams.delete(key);
      }
      for (const key of wanted) if (!streams.has(key)) streams.set(key, open(key));
    },
    stopAll(): void {
      for (const stop of streams.values()) stop();
      streams.clear();
    },
  };
}
