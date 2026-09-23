// The 5h / 7d rate-limit gauge (#387), assembled: the store, Codex's free reading, and Claude's
// probe with the lifetime rules that surround it.
//
// Its own module rather than index.ts's because none of it is boot ORDER — it is one subsystem
// with a single seam, and the object this returns is exactly what the /api/rate-limits routes
// take. index.ts keeps the call and the moment it happens.
import { createRateLimitStore, DEFAULT_ACCOUNT_KEY } from "./rate-limit-store.js";
import { startRateLimitProbe } from "./rate-limit-probe.js";
import { newProbeSessionId } from "./probe-session.js";
import { writeProbeScreen } from "./probe-stall.js";
import { removeProbeTranscript } from "./probe-transcript.js";
import { newestRolloutFile, codexSessionsDir, readRolloutTail } from "./codex-rollout.js";
import { latestRateLimitsInRollout } from "./codex-rate-limits.js";
import { rateLimitCacheFile, readRateLimitCache, createRateLimitCacheWriter } from "./rate-limit-persist.js";
import type { RateLimitRouteDeps } from "./rate-limit-routes.js";
import type { ProbeOutcome } from "./rate-limit-probe.js";
import { hasBinary } from "../infra/has-binary.js";
import { spawnPty } from "../session/pty-spawn.js";
import { accountEnvFor } from "../session/account-env.js";
import { claudeHomeForAccount } from "../session/project-dir.js";
import { getAccounts } from "../config/config-routes.js";
import { AGENT_BINS } from "../config/agent-bins.js";
import { CLAUDE_CWD, MULMOTERMINAL_HOME, PORT } from "../config/env.js";

// Long enough for claude's own final write to land after the PTY is killed. Deleting into that
// window loses the race and the file comes back — and a transcript that reappears reads exactly
// like the bug this fixes (#1010).
const TRANSCRIPT_FLUSH_MS = 5_000;

// Whether a probe could even run. Checked before spawning rather than discovered by spawning
// (#1011): a machine without `claude` used to fail so fast that it never reached the 90s timeout,
// so the store learned nothing and the next poll tried again — a spawn attempt per poll.
const claudeIsRunnable = (): boolean => {
  try {
    return hasBinary(AGENT_BINS.claude);
  } catch {
    return false;
  }
};

// A probe that stopped for a reason nothing here can name. The screen is the only evidence there
// is, and without it the next report of "usage says n/a" starts from nothing (#1293).
const reportProbeScreen = (screen: string): void => {
  if (!screen) return;
  const file = writeProbeScreen(MULMOTERMINAL_HOME, screen);
  if (file) console.warn(`[rate-limit] the usage probe reported nothing; what its terminal showed is in ${file}`);
};

/** The gauge's store and the three things the routes ask of it.
 *
 *  Codex is free — its rollout file holds the windows — while Claude needs a hidden probe session,
 *  so the store decides when spending a query is warranted. Neither agent being installed is not a
 *  case to handle: no rollout means no Codex reading, and a probe that cannot launch simply never
 *  reports, which is the same as having no data yet. Seeded from the last run so the header has
 *  numbers the moment the grid opens; probing at boot instead would spend a query on every restart
 *  — once per SAVE under `yarn dev`. */
export function createRateLimitService(): RateLimitRouteDeps {
  // Stopping the probe the moment its answer lands. Without this the PTY was held for the full
  // PROBE_TIMEOUT_MS — the status line arrives in seconds, so most of that minute and a half was a
  // live `claude` process with nothing left to say, and `probing: true` kept every browser polling
  // at seconds rather than minutes for the whole of it.
  //
  // Only a report carrying WINDOWS ends it. The status line also fires before the first API
  // response, when `rate_limits` is not there yet (see statusline.ts) — stopping on that would kill
  // the probe just before the thing it was spawned to collect.
  //
  // Keyed by account (rate-limit-store.ts's DEFAULT_ACCOUNT_KEY for the plain login), a Map rather
  // than a single reference: with 2+ accounts configured, several accounts' probes can be in flight
  // at once, and one account's answer must stop only its own probe.
  const stopClaudeRateLimitProbes = new Map<string, () => void>();

  const writeRateLimitCacheIfChanged = createRateLimitCacheWriter(rateLimitCacheFile());
  const store = createRateLimitStore(readRateLimitCache(rateLimitCacheFile()), (snapshot, agent, key) => {
    writeRateLimitCacheIfChanged(snapshot);
    if (agent === "claude" && key !== undefined) stopClaudeRateLimitProbes.get(key)?.();
  });

  const refreshCodex = (): void => {
    const file = newestRolloutFile(codexSessionsDir(), Date.now());
    if (file) store.reportCodex(latestRateLimitsInRollout(readRolloutTail(file)), Date.now());
  };

  // A probe that settles WITHOUT the status line having reported is the "asked, heard nothing"
  // case. report() has already moved the state on if anything arrived, so this only widens the gap
  // when nothing did.
  const onProbeSettled = (key: string, sessionId: string, claudeHome: string | undefined, { stall, screen }: ProbeOutcome): void => {
    // Cleared here rather than by whoever called stop(): `stop()` is idempotent, but a stale
    // reference would let the NEXT probe for this SAME key be killed by a late report belonging to
    // this one.
    stopClaudeRateLimitProbes.delete(key);
    // Only a probe that failed for a reason we cannot name leaves its screen behind — a named one
    // is already on the gauge, and a successful one has nothing to explain (#1293).
    if (store.noteProbeFailedIfNoReport(key, Date.now(), stall) && stall === "unknown") reportProbeScreen(screen);
    store.setProbeInFlight(key, false);
    // Hiding it from /api/sessions is not enough: `claude --resume` reads the transcript directory
    // itself, so the probe has to take its own file with it (#1010) — from the SAME directory it was
    // actually written under, never the plain default's, or a non-default account's probe litter is
    // never cleaned up.
    setTimeout(() => void removeProbeTranscript(CLAUDE_CWD, sessionId, claudeHome).catch(() => {}), TRANSCRIPT_FLUSH_MS).unref();
  };

  const startProbe = (key: string): void => {
    // Belt and braces: the route has already refused to want a probe when claude is missing, but
    // this is the last point before a spawn and the flag it would strand is set by the caller.
    if (!claudeIsRunnable()) {
      store.setClaudeAvailable(key, false);
      store.setProbeInFlight(key, false);
      return;
    }
    // The default key names no configured account — the plain, unconfigured login this probe has
    // always run as. Any other key must resolve to a REAL account before it can change anything;
    // an id that no longer exists (deleted between the route computing `keys` and this running)
    // falls back to that same plain login rather than refusing to probe.
    const account = key === DEFAULT_ACCOUNT_KEY ? undefined : getAccounts().find((candidate) => candidate.id === key);
    store.noteProbeStarted(key, Date.now());
    const sessionId = newProbeSessionId();
    const claudeHome = claudeHomeForAccount(account);
    stopClaudeRateLimitProbes.set(
      key,
      startRateLimitProbe({
        spawn: (args, cwd) => spawnPty(AGENT_BINS.claude, args, cwd),
        host: "localhost",
        port: PORT,
        cwd: CLAUDE_CWD,
        sessionId,
        accountKey: key,
        ...(account ? { env: accountEnvFor(account, process.env) } : {}),
        onSettled: (outcome) => onProbeSettled(key, sessionId, claudeHome, outcome),
      }),
    );
  };

  return { store, refreshCodex, startProbe, claudeAvailable: claudeIsRunnable, getAccounts, now_ms: () => Date.now() };
}
