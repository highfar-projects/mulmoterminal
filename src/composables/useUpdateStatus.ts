import { ref, computed } from "vue";
import { parseUpdateNotice } from "./updateNotice";
import { usePollWhileVisible } from "./usePollWhileVisible";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { parseUpdateStatus, type UpdateStatus } from "../../common/updateStatus";

// Two cadences, answering two different questions.
//
// The FAST one is the startup race: the server's check reaches the network (git ls-remote can
// take several seconds), so an early read comes back `ready: false` and has to be chased until
// it lands. Bounded, because a check that never finishes must not be asked forever.
const POLL_MS = 3000;
const MAX_POLLS = 5;
// The SLOW one is the server re-checking while it runs (#1821). Before that the answer could
// not change without a restart, so stopping at `ready` cost nothing; now stopping is what keeps
// the badge from ever appearing for a server started with `npx mulmoterminal@latest`. Minutes
// against the server's hours: this only decides how long after the server notices the open tab
// does, and the returning-tab refresh below usually gets there first.
const REFRESH_MS = 15 * 60_000;

// Module state, not per-caller: three components read this — the header badge, the Settings
// version line, and the shared-app preview's copy-log block — and it is one server-side value.
// Keeping it here is what lets a consumer appear showing the answer already read rather than
// blank until its own fetch returns.
const status = ref<UpdateStatus | null>(null);
let polling = false;

async function fetchOnce(): Promise<void> {
  try {
    const res = await fetchWithTimeout("/api/update-status");
    if (!res.ok) return;
    // Assign whatever came back, including a status carrying no notice: a null must CLEAR a
    // notice an earlier read picked up (e.g. after a `git pull` + restart), not just be ignored.
    status.value = parseUpdateStatus(await jsonBody(res));
  } catch {
    // best-effort — no badge, no version line
  }
}

async function poll(polls: number): Promise<void> {
  await fetchOnce();
  if (status.value?.ready || polls + 1 >= MAX_POLLS) {
    polling = false;
    return;
  }
  setTimeout(() => void poll(polls + 1), POLL_MS);
}

// Read now, and chase the answer with the fast poll while it has not landed. The guard is
// `polling` and deliberately NOT `ready`: an answer that has landed is exactly what a later
// call is here to re-ask, since the server re-checks. Guarding on `ready` too is what used to
// make this refuse to look again. It also means a server RESTART recovers on its own — a tick
// reading `ready: false` re-arms the fast poll to chase the new check.
function refresh(): void {
  if (polling) return;
  polling = true;
  void poll(0);
}

// What those three read: the running install, and the update notice when there is one.
// Best-effort — any failure just leaves the badge and the version line hidden.
//
// usePollWhileVisible rather than one module-level timer: it already refreshes on `focus` and
// `visibilitychange`, so a user returning to the tab sees a badge the server picked up while
// they were away instead of waiting out the tick, and each consumer's timer dies with it.
//
// The cost is one timer per MOUNTED consumer rather than one per module. That is bounded here
// and worth checking before adding a caller: the badge is always up, while the Settings line and
// the preview mount one at a time (the preview lives in the single right-hand pane, not per
// cell). Concurrent refreshes still collapse — `polling` admits one chase at a time — so the
// extra timers cost timers, not requests.
export function useUpdateStatus() {
  usePollWhileVisible(refresh, REFRESH_MS);
  return { status: computed(() => status.value), badge: computed(() => parseUpdateNotice(status.value?.notice)) };
}
