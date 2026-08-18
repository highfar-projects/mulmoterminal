// The load read-out's data (#1786), polled while the grid header is on screen.
//
// A singleton, like useRateLimits: every view would ask about the same machine, and one answer is
// what keeps two headers from polling twice.
//
// A GET, unlike that one. Its POST buys the server permission to spend a Claude query on a probe;
// this reads two numbers the kernel already keeps, so there is nothing to guard and nothing to
// spend.
import { ref } from "vue";
import { readLoadBody, type MachineLoad } from "../../common/machineLoad";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const FETCH_TIMEOUT_MS = 4000;
// Fast enough that the number answers "may I start another one right now?" — nine cells started
// at once move the 1-minute average within seconds, and a two-minute-old figure would answer
// about the machine as it was before they existed.
const REFRESH_MS = 10_000;
// How long a reading outlives the failure to replace it. A transient failure should not blank a
// figure that was true a moment ago, but load is a number about NOW: past this, a held reading
// stops describing the machine and starts misreporting it.
const STALE_MS = 60_000;

const load = ref<MachineLoad | null>(null);
let lastOk_ms = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let watchers = 0;

async function poll(): Promise<void> {
  try {
    const res = await fetchWithTimeout("/api/load", {}, FETCH_TIMEOUT_MS);
    if (!res.ok) return dropIfStale();
    // A body this client cannot read is a failure like any other — clearing on it would blank a
    // figure that was true a moment ago. `{ load: null }` is not that: it is the host saying it
    // keeps no load average, and holding the previous reading would go on drawing a machine that
    // has stopped reporting.
    const next = readLoadBody(await res.json());
    if (!next) return dropIfStale();
    load.value = next.load;
    lastOk_ms = Date.now();
  } catch {
    // offline, aborted, or the route is not there
    dropIfStale();
  }
}

function dropIfStale(): void {
  if (load.value !== null && Date.now() - lastOk_ms > STALE_MS) load.value = null;
}

/** Reference-counted so two mounted headers do not double the polling, and so the last one
 *  leaving actually stops it. */
export function useMachineLoad() {
  return {
    load,
    start(): void {
      watchers++;
      if (watchers > 1) return;
      // Nothing ran while there was no watcher, so the held reading has been aging unchecked —
      // a header remounted an hour later would otherwise draw that hour-old figure until its
      // first request lands (Codex on #1791). The stale window is a promise about what is on
      // screen, not about how often we poll.
      dropIfStale();
      void poll();
      timer = setInterval(() => void poll(), REFRESH_MS);
    },
    stop(): void {
      watchers = Math.max(0, watchers - 1);
      if (watchers > 0 || !timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
