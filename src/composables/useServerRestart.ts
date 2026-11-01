// Fork-only: restarting the server from the browser (POST /api/restart) and bringing this page back
// once a server answers again.
//
// Module-level for the reason useServerStopped is: the button lives in Settings and in the header's
// update popover, while what reacts to it — the overlay — sits at the app root.
//
// The page RELOADS when the server is back rather than reconnecting in place: a restart under the
// README's wrapper loop can bring up a newer build, and only a reload loads its client.
import { computed, ref, type ComputedRef } from "vue";
import { fetchWithTimeout, DEFAULT_REQUEST_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { suppressNextUnloadGuard } from "./useUnloadGuard";
import { jsonBody } from "../jsonBody";

export type RestartPhase = "idle" | "restarting" | "slow";

const POLL_MS = 1000;
// Short: a probe that hangs is a server that is not back yet, and the next tick asks again.
const PROBE_TIMEOUT_MS = 2000;
// A relaunch runs `npx github:…`, which installs and builds a new commit before the server starts —
// minutes, not seconds. Past this the overlay says so and points at the terminal, but keeps waiting.
const SLOW_AFTER_MS = 3 * 60_000;

const phase = ref<RestartPhase>("idle");
const relaunches = ref(false);

export const serverRestartPhase: ComputedRef<RestartPhase> = computed(() => phase.value);
/** Whether the server that comes back can be a newer build (the launch command is re-run). */
export const serverRestartRelaunches: ComputedRef<boolean> = computed(() => relaunches.value);

/** Whether the restart has landed. The OLD server keeps answering for the grace period after the
 *  click, so an answer counts only once the server has been seen gone. */
export const restartLanded = (sawDown: boolean, reachable: boolean): boolean => sawDown && reachable;

async function serverReachable(): Promise<boolean> {
  try {
    return (await fetchWithTimeout("/api/update-status", undefined, PROBE_TIMEOUT_MS)).ok;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function reloadWhenBack(startedAt: number): Promise<void> {
  let sawDown = false;
  for (;;) {
    await sleep(POLL_MS);
    const reachable = await serverReachable();
    if (!reachable) sawDown = true;
    if (restartLanded(sawDown, reachable)) {
      // Our own reload, not the user closing a tab full of sessions — they are tmux-backed and back.
      suppressNextUnloadGuard();
      window.location.reload();
      return;
    }
    if (phase.value === "restarting" && Date.now() - startedAt > SLOW_AFTER_MS) phase.value = "slow";
  }
}

/** Ask the server to restart. Resolves false when the request failed, so the caller can say so;
 *  true once the overlay is up and the page is waiting for the server to come back. */
export async function restartServer(): Promise<boolean> {
  if (phase.value !== "idle") return true;
  try {
    // The server answers BEFORE it goes, so this reply is the signal to put the overlay up.
    const res = await fetchWithTimeout("/api/restart", { method: "POST" }, DEFAULT_REQUEST_TIMEOUT_MS);
    if (!res.ok) throw new Error(`POST /api/restart -> ${res.status}`);
    relaunches.value = (await jsonBody(res)).relaunch === true;
  } catch (err) {
    console.warn("[restart] request failed:", err);
    return false;
  }
  phase.value = "restarting";
  void reloadWhenBack(Date.now());
  return true;
}
