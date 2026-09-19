// What happens once the HTTP server is actually listening — announce, sweep, prune, warn.
//
// Everything here needs the bound address, which is why it is not part of the boot above it: the
// loopback spares are handed the addresses this bind did not take, and the tmux sweep is
// deliberately "now, when none of OUR ptys hold anything".
import type http from "node:http";
import { announceListening } from "./announce-listening.js";
import { bindSecurityWarning } from "./allowed-origin.js";
import { boundAddress, isLoopbackBinding } from "./loopback.js";
import { tmuxAvailable, tmuxListSessionIds } from "./tmux.js";
import { startReapSchedule } from "../session/reap-schedule.js";
import { survivingAfterSweep } from "../session/reap-idle-sessions.js";
import { pruneOrphanSettings } from "../session/session-settings.js";
import { pruneOrphanDrops } from "../session/session-drops.js";
import { wireMachineGlobalHooks } from "../agents/machine-global-hooks.js";
import { startUpdateStatusRefresh } from "../config/update-status.js";
import { getSessionIdleReapDays, getSessionReapIntervalHours } from "../config/config-routes.js";
import { earliestStartedAt, liveInstances, registerInstance } from "../../bin/instances.js";
import { BIND_HOST, PORT } from "../config/env.js";

export interface ListeningDeps {
  server: http.Server;
  loopbackServers: readonly http.Server[];
  /** The origin set the boot decided on, so the warning describes the rule actually enforced. */
  browserHostnames: ReadonlySet<string>;
}

function announce({ server, loopbackServers, browserHostnames }: ListeningDeps): void {
  // Takes the loopback addresses this bind did not, and only then tells the parent — the order, the
  // guards on the send and the reason each field is on the wire are all in that module.
  void announceListening(server, loopbackServers, Number(PORT), boundAddress(server.address()), process);
  if (!isLoopbackBinding(server.address())) console.warn(bindSecurityWarning(BIND_HOST, PORT, browserHostnames));
}

/** The tmux sessions that survived, minus the ones the boot sweep just ended. */
function sweepSurvivingSessions(): ReadonlySet<string> {
  if (!tmuxAvailable()) {
    console.log("[tmux] not found — terminals are not persistent across a server restart");
    return survivingAfterSweep([], []);
  }
  const surviving = tmuxListSessionIds();
  const detail = surviving.length ? ` — ${surviving.length} session(s) survived; reattach on connect` : "";
  console.log(`[tmux] persistence on${detail}`);
  // Then end the ones nothing is using. Here rather than on a timer: a restart is when none of OUR
  // ptys hold anything, so "in use" means somebody else's, and it is the moment the pile is
  // largest. `cleanup-orphans` has existed since #367 with no caller — this is that caller, with a
  // rule that is about now instead of about the past (#1467).
  const reaped = startReapSchedule({ intervalHours: getSessionReapIntervalHours(), idleDays: getSessionIdleReapDays, log: (line) => console.log(line) });
  return survivingAfterSweep(surviving, reaped);
}

// A crash never reaches reap(), so settings files — one of which may hold a provider's API token —
// outlive the sessions that used them. Anything not backed by a surviving tmux session is an
// orphan: a PTY without tmux died with the server that owned it.
//
// …but only for OUR previous lifetime. A peer running right now has live PTYs, and without tmux
// `surviving` is empty, so its files looked like leftovers and were deleted underneath it (#1061).
// Files older than the earliest live peer cannot be theirs; newer ones might be — and that cutoff
// applies to every sweep here, not just the one the bug was reported against.
function pruneOrphansOfDeadServers(liveSessionIds: ReadonlySet<string>): void {
  const peers = liveInstances();
  const peerCutoff = earliestStartedAt(peers);
  const droppedSettings = pruneOrphanSettings(liveSessionIds, undefined, peerCutoff);
  if (droppedSettings.length) console.log(`[settings] removed ${droppedSettings.length} orphaned session settings file(s)`);
  // Dropped files are the same story: copies in tmp that only their session referred to.
  const droppedDrops = pruneOrphanDrops(liveSessionIds, undefined, peerCutoff);
  if (droppedDrops.length) console.log(`[drops] removed ${droppedDrops.length} orphaned session drop director(ies)`);
  if (peers.length) {
    const where = peers.map((peer) => (peer.port === null ? `pid ${peer.pid}` : `port ${peer.port}`)).join(", ");
    console.warn(`[instances] ${peers.length} other MulmoTerminal server(s) running (${where}) — they share ~/.mulmoterminal, which is not a supported setup`);
  }
}

export function onListening(deps: ListeningDeps): void {
  announce(deps);
  // The sweep runs BEFORE the prune: those files are orphans as of a moment ago, and one of them
  // may hold a provider's API token — waiting a whole boot to remove it is the cost of using the
  // list as it was read (#1467).
  const liveSessionIds = sweepSurvivingSessions();
  // Say we are here, so a later launcher can warn about a second instance and a later boot can tell
  // our live files from a dead server's leftovers (#1061).
  const unregisterInstance = registerInstance(Number(PORT));
  process.on("exit", unregisterInstance);
  // Both machine-global hook files — copilot's and cursor's — are removed on the way out and
  // repaired at startup. server/agents/machine-global-hooks.ts says why each half exists.
  wireMachineGlobalHooks(PORT);
  pruneOrphansOfDeadServers(liveSessionIds);
  // Run the update check for the header badge, at startup and on a timer (best-effort,
  // non-blocking). Works under `yarn dev` too, where the launcher — which used to be the only
  // checker — isn't involved.
  startUpdateStatusRefresh();
}
