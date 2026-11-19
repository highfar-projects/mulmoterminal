// The gauge's data, polled while the grid header is on screen (#387).
//
// A singleton: the windows are an account-wide budget, so every view shows the same numbers and
// polling them twice would only spend the budget twice.
//
// The poll is a POST, not a GET, and that is deliberate rather than clumsy. Asking is what permits
// the server to spend a Claude query on a probe, and `same-origin-guard.ts` gates POSTs while
// leaving safe methods open — so a GET that triggered a probe could be fired by any page the user
// happens to visit, at their expense.
import { ref, watch } from "vue";
import { peerApiPath } from "../../common/peers";
import { peerHosts } from "./peerHosts";
import { parseRateLimits, type RateLimits } from "../../common/rateLimits";
import { isRecord } from "../../common/isRecord";
import type { AccountReading, ClaudeProbeState, RateLimitSnapshot } from "./rateLimitGauge";
import { isProbeStall } from "../../common/probeStall";
import { isAccountId } from "../../common/agentAccounts";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const FETCH_TIMEOUT_MS = 8000;
// The server refuses to probe more often than its own staleness window, so a tighter poll here
// buys nothing; this only has to be often enough that a reader who leaves the tab open sees the
// number move within a few minutes of it actually moving.
const REFRESH_MS = 120_000;
// While a probe is running, though, the answer is seconds away and the gauge is visibly missing
// half of itself. Waiting out the full interval means the first thing a user ever sees is Codex
// alone — which is exactly how this read as broken the first time it was opened.
const AWAITING_PROBE_MS = 6000;

const snapshot = ref<RateLimitSnapshot | null>(null);
// Each peer's own readings (common/peers.ts), keyed by peer id. A peer is another machine's server
// with its own logins and its own token rotation, so its windows are not this server's and are
// asked of it through the relay — the same POST, which is what permits THAT server to probe.
const peerSnapshots = ref<Readonly<Record<string, RateLimitSnapshot>>>({});
let timer: ReturnType<typeof setTimeout> | null = null;
let watchers = 0;

const PROBE_STATES: readonly ClaudeProbeState[] = ["ok", "no-claude", "no-windows", "no-report"];
const isProbeState = (v: unknown): v is ClaudeProbeState => typeof v === "string" && PROBE_STATES.some((state) => state === v);

// One server's answer, or null when there is none to use. A failure leaves the last known windows
// in place. Blanking them would read as "0% used", which is the opposite of the truth we just
// failed to fetch.
async function fetchSnapshot(peer: string | null): Promise<{ snapshot: RateLimitSnapshot; probing: boolean } | null> {
  try {
    const res = await fetchWithTimeout(peerApiPath(peer, "/api/rate-limits/refresh"), { method: "POST" }, FETCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isRecord(data)) return null;
    const accounts = accountReadingsOf(data.accounts);
    return {
      snapshot: {
        claude: parseRateLimits(data.claude),
        codex: parseRateLimits(data.codex),
        // Carried verbatim rather than inferred here: the server is the only place that knows
        // whether a probe was refused, timed out, or answered with no windows (#1011).
        claudeProbe: isProbeState(data.claudeProbe) ? data.claudeProbe : undefined,
        claudeStall: isProbeStall(data.claudeProbeStall) ? data.claudeProbeStall : undefined,
        claudeProbeCwd: typeof data.claudeProbeCwd === "string" ? data.claudeProbeCwd : undefined,
        accounts: accounts.map(({ probing: _probing, ...reading }) => reading),
      },
      // Waiting on ANY probe, an account's included: each takes the better part of a minute.
      probing: data.probing === true || accounts.some((account) => account.probing),
    };
  } catch {
    // offline, aborted, or the route is not there — keep what we had
    return null;
  }
}

async function loadPeer(id: string): Promise<boolean> {
  const answer = await fetchSnapshot(id);
  if (!answer) return false;
  if (peerHosts.value.some((peer) => peer.id === id)) peerSnapshots.value = { ...peerSnapshots.value, [id]: answer.snapshot };
  return answer.probing;
}

// This server and every configured peer, together. Only the peers already known: the list is read
// by the page (loadPeerHosts) and a peer that arrives later is asked as it arrives (see start()).
async function load(): Promise<boolean> {
  const listed = new Set(peerHosts.value.map((peer) => peer.id));
  if (Object.keys(peerSnapshots.value).some((id) => !listed.has(id)))
    peerSnapshots.value = Object.fromEntries(Object.entries(peerSnapshots.value).filter(([id]) => listed.has(id)));
  const [own, ...peers] = await Promise.all([fetchSnapshot(null), ...[...listed].map(loadPeer)]);
  if (own) snapshot.value = own.snapshot;
  return own?.probing === true || peers.some(Boolean);
}

// Which chain is the live one. A counter alone cannot answer that: `load()` is in flight across
// the gap where a header unmounts and remounts, so its completion lands AFTER the new chain has
// started and — knowing only that a watcher exists — schedules a second timer. `timer` then holds
// the newer handle, stop() clears that one, and the older chain polls on forever. Every request it
// makes is one the server may answer by spending a Claude query, so a leaked chain quietly doubles
// the cost of the thing being measured.
// An account's reading (#2215). Rows that do not parse are dropped one by one, not the list.
const lastLimitsOf = (raw: unknown): { lastLimits?: RateLimits } => {
  const lastLimits = parseRateLimits(raw);
  return lastLimits ? { lastLimits } : {};
};

const accountReadingsOf = (raw: unknown): (AccountReading & { probing: boolean })[] =>
  Array.isArray(raw)
    ? raw.flatMap((row: unknown) =>
        isRecord(row) && isAccountId(row.id) && typeof row.label === "string" && (row.agent === "claude" || row.agent === "codex")
          ? [
              {
                id: row.id,
                label: row.label,
                agent: row.agent,
                limits: parseRateLimits(row.limits),
                probe: isProbeState(row.probe) ? row.probe : undefined,
                probeStall: isProbeStall(row.probeStall) ? row.probeStall : undefined,
                probing: row.probing === true,
                ...(typeof row.email === "string" ? { email: row.email } : {}),
                ...(row.rotation === true ? { rotation: true } : {}),
                ...lastLimitsOf(row.lastLimits),
              },
            ]
          : [],
      )
    : [];

let generation = 0;

// Chained rather than an interval, so the gap can depend on the answer: seconds while a probe is
// on its way, minutes once the gauge is whole.
function scheduleNext(delay_ms: number, chain: number): void {
  if (watchers === 0 || chain !== generation) return;
  timer = setTimeout(() => {
    void load().then((probing) => scheduleNext(probing ? AWAITING_PROBE_MS : REFRESH_MS, chain));
  }, delay_ms);
}

const runChain = (chain: number): void => {
  void load().then((probing) => scheduleNext(probing ? AWAITING_PROBE_MS : REFRESH_MS, chain));
};

// A peer the page learns of after the chain started is asked at once rather than on the next poll,
// minutes away — the list is read in parallel with the first poll, so this is the usual case on load.
// Synchronous, so it judges the moment the list changed: a deferred run would land after a start()
// that had already asked the same peer, and ask it twice — each ask may spend a probe there.
watch(
  peerHosts,
  (peers, before) => {
    if (watchers === 0) return;
    const known = new Set((before ?? []).map((peer) => peer.id));
    for (const peer of peers) if (!known.has(peer.id)) void loadPeer(peer.id);
  },
  { flush: "sync" },
);

/** Reference-counted so two mounted headers do not double the polling — and so the last one
 * leaving actually stops it, which is what keeps the server from probing for nobody. */
export function useRateLimits() {
  return {
    snapshot,
    peerSnapshots,
    start(): void {
      watchers++;
      // Only the zero-to-one transition starts a chain; a second header rides the first one's.
      if (watchers > 1) return;
      generation++;
      runChain(generation);
    },
    stop(): void {
      watchers = Math.max(0, watchers - 1);
      if (watchers > 0) return;
      // Retire the chain even when there is no timer to clear — that is precisely the window where
      // a `load()` is still in flight and would otherwise schedule one after we stopped caring.
      generation++;
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}
