// Usage windows for each ACCOUNT (#2215) — a second login's 5h / 7d, shown beside the default one's.
//
// The default login keeps the store it always had (rate-limit-service.ts) and nothing here touches
// it. Each account gets a store of its own — the same one, with the same probe gate and backoff —
// so a login that is not signed in yet backs off on its own schedule without holding up the others,
// and its readings are cached in a file of its own (rate-limit-persist.ts).
//
// Codex is read from the account's own rollouts, free on every poll. Claude needs a probe, exactly
// as the default does: a hidden session started under the account's CLAUDE_CONFIG_DIR, whose
// statusLine reports to `/api/rate-limits?probe=<key>`, a key minted for that probe, so the reading
// lands in the login it measured — not in whatever the account id names by the time it answers.
import { randomBytes } from "node:crypto";
import type { AgentAccount } from "../../common/agentAccounts.js";
import type { RateLimits } from "../../common/rateLimits.js";
import { createRateLimitStore, currentClaudeLimits, type ProbeState, type RateLimitStore } from "./rate-limit-store.js";
import { createRateLimitCacheWriter, rateLimitCacheFile, readRateLimitCache } from "./rate-limit-persist.js";
import type { ClaudeStatus } from "./statusline.js";
import type { ProbeStall } from "./probe-stall.js";

/** What one account's gauge needs, as the route sends it. */
export interface AccountRateLimitReading {
  id: string;
  label: string;
  agent: AgentAccount["agent"];
  limits: RateLimits | null;
  probing: boolean;
  probe: ProbeState["kind"];
  probeStall: ProbeStall | undefined;
}

export interface AccountRateLimitDeps {
  /** The configured accounts, read live so an added one is measured without a restart. */
  accounts: () => readonly AgentAccount[];
  /** The account's home, absolute. */
  homeOf: (account: AgentAccount) => string;
  /** The newest windows in a codex home's rollouts, or null. */
  readCodex: (home: string) => RateLimits | null;
  /** Start a Claude probe under this home, whose statusLine reports with `probeReportKey`; returns its
   *  stop function. `onSettled` reports whether the statusLine ever answered. */
  startClaudeProbe: (home: string, probeReportKey: string, onSettled: (stall: ProbeStall) => void) => () => void;
  claudeAvailable: () => boolean;
  /** Where a login's readings are cached; a spec points it away from ~/.mulmoterminal. */
  cacheFile?: (login: string) => string;
}

/** One account's gauge, from its store: Claude's windows only while they are recent enough to vouch
 *  for (the same rule as the default's), Codex's as last read. */
function readingOf(account: AgentAccount, store: RateLimitStore, now_ms: number): AccountRateLimitReading {
  const snapshot = store.snapshot();
  const state = store.probeState();
  return {
    id: account.id,
    label: account.label,
    agent: account.agent,
    limits: account.agent === "claude" ? currentClaudeLimits(snapshot, now_ms) : (snapshot.codex?.limits ?? null),
    probing: store.isProbing(),
    probe: state.kind,
    probeStall: state.kind === "no-report" ? state.stall : undefined,
  };
}

interface Meter {
  store: RateLimitStore;
  stopProbe: (() => void) | null;
}

const PROBE_REPORT_KEY_BYTES = 8;

export function createAccountRateLimits(deps: AccountRateLimitDeps) {
  const meters = new Map<string, Meter>();
  // A running probe's report key → the login it measures. Removed when the probe settles, so a key
  // is only good for as long as its probe is.
  const probeLogins = new Map<string, string>();

  // A meter measures a LOGIN — an agent's home — not an account id: the id is a name the user can
  // reuse for another home, and a reading follows the subscription, not the name.
  const loginOf = (account: AgentAccount): string => `${account.agent}:${deps.homeOf(account)}`;

  const meterFor = (account: AgentAccount): Meter => {
    const login = loginOf(account);
    const existing = meters.get(login);
    if (existing) return existing;
    const file = (deps.cacheFile ?? rateLimitCacheFile)(login);
    const write = createRateLimitCacheWriter(file);
    // The change hook is where the default service stops its probe once windows arrive; an
    // account's does the same, and persists its own snapshot.
    const store = createRateLimitStore(readRateLimitCache(file), (snapshot, agent) => {
      write(snapshot);
      if (agent === "claude") meters.get(login)?.stopProbe?.();
    });
    const meter: Meter = { store, stopProbe: null };
    meters.set(login, meter);
    return meter;
  };

  const startProbe = (account: AgentAccount, meter: Meter, now_ms: number): void => {
    meter.store.setProbeInFlight(true);
    meter.store.noteProbeStarted(now_ms);
    const probeReportKey = randomBytes(PROBE_REPORT_KEY_BYTES).toString("hex");
    probeLogins.set(probeReportKey, loginOf(account));
    try {
      meter.stopProbe = deps.startClaudeProbe(deps.homeOf(account), probeReportKey, (stall) => {
        probeLogins.delete(probeReportKey);
        meter.stopProbe = null;
        meter.store.noteProbeFailedIfNoReport(Date.now(), stall);
        meter.store.setProbeInFlight(false);
      });
    } catch {
      probeLogins.delete(probeReportKey);
      meter.store.setProbeInFlight(false);
    }
  };

  const refreshOne = (account: AgentAccount, now_ms: number): void => {
    const meter = meterFor(account);
    meter.store.noteAsked(now_ms);
    if (account.agent === "codex") {
      meter.store.reportCodex(deps.readCodex(deps.homeOf(account)), now_ms);
      return;
    }
    meter.store.setClaudeAvailable(deps.claudeAvailable());
    if (meter.store.wantsProbe(now_ms)) startProbe(account, meter, now_ms);
  };

  return {
    /** A poll: read every codex account, and probe every claude account that is due. */
    refresh(now_ms: number): void {
      deps.accounts().forEach((account) => refreshOne(account, now_ms));
    },
    /** One Claude status line from an account's probe, filed under the login that probe measured.
     *  A key no running probe holds is dropped: nothing else could have asked for it. */
    reportClaudeStatus(probeReportKey: string, status: ClaudeStatus, now_ms: number): void {
      const login = probeLogins.get(probeReportKey);
      const meter = login === undefined ? undefined : meters.get(login);
      meter?.store.reportClaudeStatus(status, now_ms);
    },
    /** Every configured account's reading, in config order. Empty when there are none — which is
     *  what keeps the route's response exactly as it was for a user without accounts. */
    readings(now_ms: number): AccountRateLimitReading[] {
      return deps.accounts().map((account) => readingOf(account, meterFor(account).store, now_ms));
    },
  };
}

export type AccountRateLimits = ReturnType<typeof createAccountRateLimits>;
