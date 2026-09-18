// Pure decisions for the dev backend supervisor (scripts/dev-server.mjs), split out so the
// two invariants Codex flagged can be pinned without spawning a real backend: which dirs are
// watched (a stale one means edits to common/ or bin/ don't reload), and whether a (re)start
// should be scheduled (the guard that collapses an overlapping crash + file-change into a
// single spawn instead of racing two backends onto port 34567).
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { restartPlan as sharedRestartPlan } from "../bin/server-restart-policy.js";

/**
 * The directories whose source changes trigger a reload. The backend imports repo code from
 * common/ and bin/ (e.g. server/config/config-schema.ts -> ../../common/modelIds.ts,
 * server/config/update-status.ts -> ../../bin/update-check.js), so all three must be watched to
 * match what `node --watch` covered. DEV_SERVER_WATCH overrides with a single dir (test only).
 * @param {Record<string, string | undefined>} env
 * @param {string} root
 * @returns {string[]}
 */
export function resolveWatchDirs(env, root) {
  if (env.DEV_SERVER_WATCH) return [path.resolve(env.DEV_SERVER_WATCH)];
  return ["server", "common", "bin"].map((d) => path.join(root, d));
}

/**
 * Whether a fresh backend should be scheduled now. False while shutting down, and false when one
 * is already scheduled — the idempotency that makes a crash landing inside a file-change debounce
 * collapse to one spawn rather than two.
 * @param {{ shuttingDown: boolean, restartPending: boolean }} state
 * @returns {boolean}
 */
export function shouldSchedule({ shuttingDown, restartPending }) {
  return !shuttingDown && !restartPending;
}

/** A change worth reloading for — source files, not editor temp/swap files. */
export function isReloadableChange(filename) {
  return typeof filename === "string" && /\.(ts|mjs|js|json)$/.test(filename);
}

/**
 * Filters a `fs.watch` event down to ones that actually changed a file's BYTES, not just its
 * mtime. `fs.watch` fires on the metadata touch too — an antivirus/EDR real-time scan opening
 * the file, a corporate sync client, `git checkout` rewriting every mtime on a branch switch —
 * and none of those are a reload worth having. Measured on a monitored corporate machine: a
 * single scan pass touched a dozen-plus distinct source files inside a minute, and since the
 * supervisor's own debounce is only 120ms per file, that became a dozen-plus SEPARATE backend
 * restarts rather than one. On Windows, which has no tmux to ride a restart out silently, each
 * one drops and respawns every live terminal — indistinguishable, to whoever is sitting at it,
 * from the app crashing over and over.
 *
 * Returns a `hasChanged(absPath)` predicate holding one hash per path it has seen. Fails OPEN on
 * a read error (deleted, permission denied, a transient glitch) — reporting "changed" — because
 * mistaking a real edit for a no-op touch would silently break reload, and the failure modes this
 * exists to filter (a scan, a sync, a checkout) all still leave the file readable afterwards.
 */
export function createContentChangeFilter() {
  const hashes = new Map(); // absolute path -> hex digest of its last-seen content
  return function hasChanged(absPath) {
    let hash;
    try {
      // sha256, not sha1: purely a change-detection cache key (never a security boundary), but
      // sha1 trips the linter's weak-hash rule wherever it appears, sensitive or not.
      hash = createHash("sha256").update(readFileSync(absPath)).digest("hex");
    } catch {
      hashes.delete(absPath);
      return true;
    }
    const previous = hashes.get(absPath);
    hashes.set(absPath, hash);
    return previous !== hash;
  };
}

/** The exit code `server/index.ts` leaves with when the port was already taken. Kept in sync
 *  with `PORT_IN_USE_EXIT_CODE` in server/infra/server-exit.ts, which a spec pins. */
export const PORT_IN_USE_EXIT_CODE = 75;

/**
 * What to do about a backend that just exited: come back, back off, or stop trying.
 *
 * The supervisor used to decide this from HOW FAST the process died, which is the wrong
 * question. The backend does its whole setup — seeding help docs, syncing skills, registering
 * scheduler tasks — BEFORE it binds the port, so a second `yarn dev` on a taken port took ~3s to
 * fail: longer than the fast-crash window, so every exit reset the delay to its minimum and the
 * exponential backoff never once fired. That respawned a 113% CPU boot every 3-4 seconds forever,
 * and on the machine that reported it the load average sat at 75-80 until it was noticed (#1735).
 *
 * So the answer is two rules instead of one timing heuristic:
 *
 * - **A port that is taken will still be taken next time.** Retrying cannot fix it, and each
 *   attempt re-runs setup with real side effects (files copied into the user's home). Stop and
 *   say so; a file change still re-arms the loop, which is how the dev actually recovers.
 * - **Otherwise count CONSECUTIVE failures**, not elapsed time. A slow crash loop is still a
 *   crash loop. `runFor` no longer decides anything; a run that reached the port resets the
 *   count via `restartPlan`'s caller.
 *
 * The decision itself lives in bin/server-restart-policy.js now — shared with the production
 * launcher (bin/mulmoterminal.js), which needed the exact same policy for the exact same reason
 * once it grew its own crash-restart (a production `npx mulmoterminal` used to have no restart
 * safety net at all: a server crash just left the launcher, and every session it held, dead until
 * a human noticed and re-ran the command). This wrapper only supplies OUR PORT_IN_USE_EXIT_CODE,
 * so `dev-server.mjs`'s existing import keeps working unchanged.
 *
 * @param {{ code: number | null, signal: string | null, consecutiveFailures: number,
 *           minDelayMs: number, maxDelayMs: number }} exit
 * @returns {{ retry: boolean, delayMs: number, reason: string }}
 */
export function restartPlan(exit) {
  return sharedRestartPlan({ ...exit, portInUseCode: PORT_IN_USE_EXIT_CODE });
}

/**
 * Whether a child's IPC message is the backend saying it bound the port.
 *
 * This is what resets the crash count — deliberately NOT elapsed time. The backend does its whole
 * setup before it binds, so "it stayed up N seconds" says nothing about whether the port was ever
 * reached: on a slow machine, or with a pre-bind failure that takes longer than N, every crash
 * would look healthy and the loop would run at the floor forever (#1735).
 *
 * A message from anywhere else must not count, hence the shape check rather than truthiness.
 * @param {unknown} msg
 * @returns {boolean}
 */
export function isListeningMessage(msg) {
  return typeof msg === "object" && msg !== null && /** @type {{ type?: unknown }} */ (msg).type === "listening";
}
