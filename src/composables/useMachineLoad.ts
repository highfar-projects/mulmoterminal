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
// How long a reading outlives the failure to replace it — exactly, from the moment it arrived. A
// transient failure should not blank a figure that was true a moment ago, but load is a number
// about NOW: past this, a held reading stops describing the machine and starts misreporting it.
const STALE_MS = 60_000;

const load = ref<MachineLoad | null>(null);
let lastOk_ms = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let staleTimer: ReturnType<typeof setTimeout> | null = null;
let watchers = 0;

// Which visit a request belongs to. A poll started before the last header unmounted is still in
// flight afterwards, and without this it would land on the NEXT visit and put an older reading
// back over a newer one — the same hazard useRateLimits.ts retires its chains for (Codex on
// #1791). Bumped on both ends, so neither an unmount nor a remount can be overtaken by the visit
// before it.
let generation = 0;

async function poll(chain: number): Promise<void> {
  try {
    const res = await fetchWithTimeout("/api/load", {}, FETCH_TIMEOUT_MS);
    // A body this client cannot read is a failure like any other — clearing on it would blank a
    // figure that was true a moment ago. `{ load: null }` is not that: it is the host saying it
    // keeps no load average, and holding the previous reading would go on drawing a machine that
    // has stopped reporting.
    const next = res.ok ? readLoadBody(await res.json()) : null;
    if (chain !== generation) return;
    // A failure changes nothing: the reading already carries its own deadline, and this poll had
    // no better answer to replace it with.
    if (!next) return;
    load.value = next.load;
    lastOk_ms = Date.now();
    holdUntilStale();
  } catch {
    // offline, aborted, or the route is not there
  }
}

/** Arm the deadline the reading on screen is honest until — measured from when it ARRIVED, not
 *  from now, so a remount cannot renew a figure by looking at it.
 *
 *  A timer rather than a check inside `poll()`: expiry that can only happen when a request
 *  finishes is bounded by the poll interval and the request's own timeout on top of the window,
 *  which made a documented 60 seconds up to 74 (Codex on #1791). Nothing to arm when there is no
 *  figure to outlive — including a host that reports no load average. */
function holdUntilStale(): void {
  clearStaleTimer();
  if (load.value === null) return;
  const remaining_ms = STALE_MS - (Date.now() - lastOk_ms);
  // Already spent: nothing ran while no one was watching, and this reading is past its window.
  if (remaining_ms <= 0) {
    load.value = null;
    return;
  }
  staleTimer = setTimeout(() => {
    load.value = null;
    staleTimer = null;
  }, remaining_ms);
}

function clearStaleTimer(): void {
  if (!staleTimer) return;
  clearTimeout(staleTimer);
  staleTimer = null;
}

/** Reference-counted so two mounted headers do not double the polling, and so the last one
 *  leaving actually stops it. */
export function useMachineLoad() {
  return {
    load,
    start(): void {
      watchers++;
      if (watchers > 1) return;
      // Nothing ran while there was no watcher, so the held reading has been aging unchecked — a
      // header remounted an hour later would otherwise draw that hour-old figure until its first
      // request lands (Codex on #1791). Re-arming from `lastOk_ms` both drops what is already
      // spent and gives back only what is left of the window.
      holdUntilStale();
      const chain = ++generation;
      void poll(chain);
      timer = setInterval(() => void poll(chain), REFRESH_MS);
    },
    stop(): void {
      watchers = Math.max(0, watchers - 1);
      if (watchers > 0) return;
      // Retired even when there is no timer to clear — that is precisely the window where a poll
      // is still in flight and would otherwise apply its answer to whoever mounts next.
      generation++;
      // The deadline goes with the polling: a timer that fires while nothing is watching would
      // blank a value no one is rendering, and `holdUntilStale()` settles the same question on
      // the way back in.
      clearStaleTimer();
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
