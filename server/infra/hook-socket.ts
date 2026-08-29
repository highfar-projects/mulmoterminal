// A Unix-domain-socket twin of the hook route (see routes/hook-routes.ts), reachable from inside
// a devcontainer without crossing the network boundary loopback and isAllowedOrigin both assume.
//
// A devcontainer session runs in its own network namespace, so the hook's
// `curl http://localhost:<port>/api/hook` reaches nothing there — `localhost` inside the
// container is the container, not this machine (the symptom: every hook POST fails silently,
// since the curl in hook-settings.ts redirects stderr to swallow it). Pointing that curl at the
// container's default-route gateway instead would trade ECONNREFUSED for a 403: isAllowedOrigin
// trusts an Origin-less request only when the peer is loopback (see infra/allowed-origin.ts,
// infra/loopback-listener.ts), and a bridge peer is not that — widening the peer check itself is
// the "obvious and wrong" alternative loopback-listener.ts already documents rejecting.
//
// A socket file sidesteps both, because it never crosses a network boundary at all: bind-mounted
// into the container at the SAME path it has on the host (see devcontainer-flag.ts), `curl
// --unix-socket <path>` from inside reaches this listener directly, and Node reports no
// `remoteAddress` for a Unix-socket peer — which isAllowedOrigin already treats as local (that
// `remoteAddress === undefined` branch exists for exactly this shape of caller).
//
// The mount is of hookSocketDir(), never of one socket file directly. A dev server restarts often
// (crash-restart + reload-on-change), and startHookSocketListener below unlinks and recreates the
// file on every boot — a container that bind-mounted the FILE keeps pointing at that old, now
// orphaned inode after a restart, and every hook curl inside it fails with connection refused
// until the container itself is recreated (found live: a running devcontainer session went stale
// this way after two in-session server restarts). Mounting the DIRECTORY instead shares the
// directory entry, not a snapshot of one file in it — a name recreated inside an already-mounted
// directory is visible from the container immediately, no container recreate needed. The
// directory holds nothing but socket files (see hookSocketPath), unlike MULMOTERMINAL_HOME as a
// whole, which also carries session-settings.ts's 0600 provider-token files — mounting THAT
// wholesale into every devcontainer would leak one session's token to every other session's
// container.
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { MULMOTERMINAL_HOME } from "../config/env.js";

/** The directory bind-mounted into a devcontainer (devcontainer-flag.ts) — never a single socket
 *  file, see the module doc above for why. */
export function hookSocketDir(): string {
  return path.join(MULMOTERMINAL_HOME, "hook-sockets");
}

/** Where one instance's socket lives, namespaced by port so two instances on one machine don't
 *  collide. */
export function hookSocketPath(port: string | number): string {
  return path.join(hookSocketDir(), `${port}.sock`);
}

/** Only what this needs from the third server, so `http.Server` satisfies it structurally and a
 *  test can hand over a recorder without a cast — same shape as loopback-listener.ts. */
export interface HookSocketListener {
  once(event: "error", handler: (err: NodeJS.ErrnoException) => void): unknown;
  listen(path: string, onListening: () => void): unknown;
}

/**
 * Serve the app over a Unix domain socket at hookSocketPath(port), best effort.
 *
 * BEST EFFORT, and deliberately not fatal, for the same reason startLoopbackListener isn't: a
 * devcontainer session needs this, nothing else does, and a machine that can't create it (no
 * AF_UNIX support, an odd permission setup) should keep today's host-only behavior rather than
 * fail to boot over a feature it isn't using.
 *
 * Windows is skipped outright rather than attempted: devcontainers there run through Docker
 * Desktop's own VM, whose Linux containers cannot bind-mount a Windows-side named pipe as a
 * Unix socket, so listening here would never be reachable anyway.
 */
export function startHookSocketListener(listener: HookSocketListener, port: string | number): void {
  if (process.platform === "win32") return;
  const socketPath = hookSocketPath(port);
  mkdirSync(hookSocketDir(), { recursive: true });
  // A socket file left behind by a process that didn't exit cleanly makes the next bind fail
  // with EADDRINUSE even though nothing is listening — remove it first, same as a stale pidfile.
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // Best effort — a bind failure below is reported the same way either way.
    }
  }
  listener.once("error", (err: NodeJS.ErrnoException) => {
    console.warn(
      `\x1b[33m[bind]\x1b[0m could not listen on ${socketPath} (${err.code ?? err.message}) — a devcontainer session's hooks will fail to report status until this is fixed.`,
    );
  });
  listener.listen(socketPath, () => {
    console.log(`[bind] also listening on ${socketPath} so a devcontainer session can reach the server`);
  });
}
