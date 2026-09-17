// The two ends of the gauge (#387): where the probe reports, and where the browser reads.
//
// No origin check of its own — `sameOriginGuard` already gates every POST centrally, which is
// exactly the arrangement that file argues for ("a route added tomorrow is covered by default
// rather than by memory"). The probe's own report carries no Origin and comes from loopback, which
// that predicate allows.
//
// The refresh is a POST and not a side effect on the GET, for the reason same-origin-guard.ts
// states outright: safe methods are not gated, so a cross-site `<img src=…/api/rate-limits>` would
// otherwise spend the user's quota on a probe. The GET stays a pure read.
import type { Express } from "express";
import { readClaudeStatus } from "./statusline.js";
import { currentClaudeLimits, DEFAULT_ACCOUNT_KEY } from "./rate-limit-store.js";
import type { ProbeState } from "./rate-limit-store.js";
import type { RateLimitStore } from "./rate-limit-store.js";
import type { Account } from "../../common/accounts.js";
import type { RateLimits } from "../../common/rateLimits.js";
import type { ProbeStall } from "./probe-stall.js";

export interface RateLimitRouteDeps {
  store: RateLimitStore;
  /** Re-read Codex's rollout from disk. Free, so it happens on every refresh. */
  refreshCodex: () => void;
  /** Spawn the Claude probe for one account key (DEFAULT_ACCOUNT_KEY for the plain, unconfigured
   *  login). Only called when the store says that key is worth a query. */
  startProbe: (key: string) => void;
  /** Whether `claude` could be launched right now — a PATH lookup, not a spawn. Asked on every
   *  poll so the "not installed" state can clear itself when one appears (#1019). */
  claudeAvailable: () => boolean;
  /** The configured Claude accounts, read live (config-routes.ts's getAccounts()) so a Settings
   *  edit changes which keys are probed on the very next poll, no restart needed. */
  getAccounts: () => Account[];
  now_ms: () => number;
}

// Which keys are in play for this request. Below two accounts there is nothing to distinguish —
// the plain login is the only reading anyone could mean — so the whole rest of this file collapses
// to today's single-reading behaviour rather than needing a separate code path for it.
const claudeKeysFor = (accounts: Account[]): string[] => (accounts.length >= 2 ? accounts.map((account) => account.id) : [DEFAULT_ACCOUNT_KEY]);

export function mountRateLimitRoutes(app: Express, deps: RateLimitRouteDeps): void {
  // Written by the statusLine given to the probe, which pipes Claude Code's status payload here.
  // A probe's session id does not say which account it was measuring, so the key travels with the
  // request instead — the same param the browser's own refresh uses to ask for one.
  app.post("/api/rate-limits", (req, res) => {
    const key = typeof req.query.account === "string" ? req.query.account : DEFAULT_ACCOUNT_KEY;
    deps.store.reportClaudeStatus(key, readClaudeStatus(req.body), deps.now_ms());
    res.json({ ok: true });
  });

  // The browser says "I am looking at this". That permission is what lets a probe run at all.
  app.post("/api/rate-limits/refresh", (_req, res) => {
    const now = deps.now_ms();
    const keys = claudeKeysFor(deps.getAccounts());
    deps.store.noteAsked(now);
    deps.refreshCodex();
    const available = deps.claudeAvailable();
    for (const key of keys) {
      deps.store.setClaudeAvailable(key, available);
      if (deps.store.wantsProbe(key, now)) {
        deps.store.setProbeInFlight(key, true);
        // Belt and braces. `startRateLimitProbe` reports its own setup failures rather than
        // throwing, but the flag it would strand is set HERE — so this route does not get to
        // depend on that promise being kept by whatever is wired in next.
        try {
          deps.startProbe(key);
        } catch {
          deps.store.setProbeInFlight(key, false);
        }
      }
    }
    res.json(snapshotBody(deps.store, keys, now));
  });

  app.get("/api/rate-limits", (_req, res) => {
    res.json(snapshotBody(deps.store, claudeKeysFor(deps.getAccounts()), deps.now_ms()));
  });
}

interface ClaudeAccountReading {
  limits: RateLimits | null;
  probe: ProbeState["kind"];
  stall?: ProbeStall;
}

const claudeReadingFor = (store: RateLimitStore, key: string, now_ms: number): ClaudeAccountReading => {
  const state = store.probeState(key);
  return {
    limits: currentClaudeLimits(store.snapshot(), key, now_ms),
    probe: state.kind,
    ...(state.kind === "no-report" ? { stall: state.stall } : {}),
  };
};

// An agent with nothing to report is simply absent, so the client can tell "no data" from "0%".
// An agent that is not installed at all reaches this the same way — there is no separate
// "unavailable" state to render, because there is nothing useful to say about a tool the user
// does not use.
// `probing` is not decoration: a Claude probe takes most of a minute, so a client polling on its
// normal interval paints Codex alone and keeps that half-gauge on screen for minutes. Saying a
// reading is on its way is what lets the client wait for it instead.
// `claudeProbe`/`claudeProbeStall` carry WHY the Claude half is missing, when it is — see
// ClaudeAccountReading above for the same fields, keyed, in the multi-account case.
//
// Below two accounts, `claude`/`claudeProbe`/`claudeProbeStall` describe the one key in play and
// `claudeAccounts` is omitted — this is deliberately BYTE-IDENTICAL to the shape this route sent
// before accounts existed, so a single-account or no-account install sees no wire change at all.
// At two or more, those three fields are dropped in favour of `claudeAccounts`, one entry per
// configured account — nothing needs both shapes at once, and sending both would leave a client
// with two different answers to reconcile.
const snapshotBody = (store: RateLimitStore, keys: string[], now_ms: number) => {
  const probing = keys.some((key) => store.isProbing(key));
  const codex = store.snapshot().codex?.limits ?? null;
  if (keys.length > 1) {
    const claudeAccounts = Object.fromEntries(keys.map((key) => [key, claudeReadingFor(store, key, now_ms)]));
    return { codex, probing, claudeAccounts };
  }
  const reading = claudeReadingFor(store, keys[0] ?? DEFAULT_ACCOUNT_KEY, now_ms);
  return { codex, probing, claude: reading.limits, claudeProbe: reading.probe, claudeProbeStall: reading.stall };
};
