// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import express from "express";
import { routeCall } from "../../test/helpers/routeCall.js";
import { createRateLimitStore, DEFAULT_ACCOUNT_KEY } from "./rate-limit-store.js";
import { mountRateLimitRoutes, type RateLimitRouteDeps } from "./rate-limit-routes.js";
import type { Account } from "../../common/accounts.js";

const NOW = 1_700_000_000_000;
const limits = { fiveHour: { usedPercentage: 27, resetsAt_sec: 1 }, sevenDay: null };

const account = (id: string, label: string): Account => ({ id, label, configDir: `~/.claude-${id}` });

const buildApp = (deps: Partial<RateLimitRouteDeps> = {}) => {
  const store = deps.store ?? createRateLimitStore();
  const app = express();
  app.use(express.json());
  mountRateLimitRoutes(app, {
    refreshCodex: () => {},
    startProbe: () => {},
    claudeAvailable: () => true,
    getAccounts: () => [],
    now_ms: () => NOW,
    ...deps,
    store,
  });
  return { app, store };
};

// Below two accounts, this route must send exactly what it sent before accounts existed — most
// installs have 0 or 1, and this is the regression guard for that majority.
describe("mountRateLimitRoutes — no or one account configured", () => {
  it("keeps the old flat shape with zero accounts configured", async () => {
    const store = createRateLimitStore();
    store.reportClaudeStatus(DEFAULT_ACCOUNT_KEY, { limits, afterApiResponse: true }, NOW);
    const { app } = buildApp({ store, getAccounts: () => [] });
    const call = routeCall(app);
    const res = await call("/api/rate-limits");
    expect(res.body).toMatchObject({ claude: limits, claudeProbe: "ok" });
    expect(res.body).not.toHaveProperty("claudeAccounts");
  });

  it("keeps the old flat shape with exactly one account configured", async () => {
    const store = createRateLimitStore();
    store.reportClaudeStatus(DEFAULT_ACCOUNT_KEY, { limits, afterApiResponse: true }, NOW);
    const { app } = buildApp({ store, getAccounts: () => [account("work", "Work")] });
    const res = await routeCall(app)("/api/rate-limits");
    // One account configured still reads from DEFAULT_ACCOUNT_KEY, not the account's own id — the
    // single-account case has nothing to disambiguate, so the plain login is still what is shown.
    expect(res.body).toMatchObject({ claude: limits, claudeProbe: "ok" });
    expect(res.body).not.toHaveProperty("claudeAccounts");
  });

  it("still starts a probe for the plain login when nothing has been read yet", async () => {
    const startProbe = vi.fn();
    const { app } = buildApp({ startProbe, getAccounts: () => [] });
    await routeCall(app)("/api/rate-limits/refresh", { method: "POST" });
    expect(startProbe).toHaveBeenCalledWith(DEFAULT_ACCOUNT_KEY);
  });
});

describe("mountRateLimitRoutes — two or more accounts configured", () => {
  const accounts = [account("work", "Work"), account("personal", "Personal")];

  it("reports one entry per configured account, and omits the old flat fields", async () => {
    const store = createRateLimitStore();
    store.reportClaudeStatus("work", { limits, afterApiResponse: true }, NOW);
    const { app } = buildApp({ store, getAccounts: () => accounts });
    const res = await routeCall(app)("/api/rate-limits");
    expect(res.body).not.toHaveProperty("claude");
    expect(res.body).not.toHaveProperty("claudeProbe");
    expect(res.body.claudeAccounts).toMatchObject({
      work: { limits, probe: "ok" },
      personal: { limits: null, probe: "ok" },
    });
  });

  it("starts a probe for each stale account, and none for a fresh one", async () => {
    const store = createRateLimitStore();
    store.reportClaudeStatus("work", { limits, afterApiResponse: true }, NOW); // fresh
    const startProbe = vi.fn();
    const { app } = buildApp({ store, startProbe, getAccounts: () => accounts, now_ms: () => NOW });
    await routeCall(app)("/api/rate-limits/refresh", { method: "POST" });
    expect(startProbe).toHaveBeenCalledWith("personal");
    expect(startProbe).not.toHaveBeenCalledWith("work");
  });

  it("does not let one account's probe-in-flight state block another's", async () => {
    const store = createRateLimitStore();
    store.noteAsked(NOW);
    store.setProbeInFlight("work", true);
    const startProbe = vi.fn();
    const { app } = buildApp({ store, startProbe, getAccounts: () => accounts, now_ms: () => NOW });
    await routeCall(app)("/api/rate-limits/refresh", { method: "POST" });
    expect(startProbe).toHaveBeenCalledWith("personal");
    expect(startProbe).not.toHaveBeenCalledWith("work");
  });

  it("reports probing while ANY configured account's probe is in flight", async () => {
    const store = createRateLimitStore();
    store.setProbeInFlight("personal", true);
    const { app } = buildApp({ store, getAccounts: () => accounts });
    const res = await routeCall(app)("/api/rate-limits");
    expect(res.body.probing).toBe(true);
  });

  // The probe's own report carries `?account=<key>` (statusline.ts's statusLineCommand) — this is
  // the route on the receiving end of that.
  it("credits a posted status line to the account named on the query string", async () => {
    const store = createRateLimitStore();
    const { app } = buildApp({ store, getAccounts: () => accounts });
    await routeCall(app)("/api/rate-limits?account=personal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rate_limits: { five_hour: { used_percentage: 27, resets_at: 1 } }, cost: { total_api_duration_ms: 1 } }),
    });
    expect(store.snapshot().claude?.personal?.limits.fiveHour?.usedPercentage).toBe(27);
    expect(store.snapshot().claude?.work).toBeUndefined();
  });

  it("falls back to the default key when no account is named on the query string", async () => {
    const store = createRateLimitStore();
    const { app } = buildApp({ store, getAccounts: () => accounts });
    await routeCall(app)("/api/rate-limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rate_limits: { five_hour: { used_percentage: 5, resets_at: 1 } }, cost: { total_api_duration_ms: 1 } }),
    });
    expect(store.snapshot().claude?.[DEFAULT_ACCOUNT_KEY]?.limits.fiveHour?.usedPercentage).toBe(5);
  });
});
