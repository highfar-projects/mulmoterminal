// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentAccount } from "../../../common/agentAccounts.js";
import { isRecord } from "../../../common/isRecord.js";
import type { RateLimits } from "../../../common/rateLimits.js";
import { createAccountRateLimits, type AccountRateLimitDeps } from "../../../server/agents/account-rate-limits.js";
import { createRateLimitStore } from "../../../server/agents/rate-limit-store.js";
import { mountRateLimitRoutes } from "../../../server/agents/rate-limit-routes.js";
import { rateLimitCacheFile } from "../../../server/agents/rate-limit-persist.js";
import { statusLineCommand } from "../../../server/agents/statusline.js";
import type { ProbeStall } from "../../../server/agents/probe-stall.js";

const WORK: AgentAccount = { id: "work", label: "Work", agent: "claude", home: "/h/claude-work" };
const CW: AgentAccount = { id: "cw", label: "Codex work", agent: "codex", home: "/h/codex-work" };
const LIMITS: RateLimits = { fiveHour: { usedPercentage: 40, resetsAt_sec: null }, sevenDay: null };
const NOW = 1_700_000_000_000;
const WITH_WINDOWS = { rate_limits: { five_hour: { used_percentage: 40 } }, cost: { total_api_duration_ms: 1 } };

let dir = "";
let probes: { account: string; home: string; settle: (stall: ProbeStall) => void }[] = [];
let codexHomesRead: string[] = [];
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "mt-account-rl-"));
  probes = [];
  codexHomesRead = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const meters = (accounts: AgentAccount[], over: Partial<AccountRateLimitDeps> = {}) =>
  createAccountRateLimits({
    accounts: () => accounts,
    homeOf: (account) => account.home,
    readCodex: (home) => {
      codexHomesRead.push(home);
      return LIMITS;
    },
    startClaudeProbe: (account, home, settle) => {
      probes.push({ account: account.id, home, settle });
      return () => {};
    },
    claudeAvailable: () => true,
    cacheFile: (login) => path.join(dir, `${encodeURIComponent(login)}.json`),
    ...over,
  });

describe("createAccountRateLimits (#2215)", () => {
  it("reports nothing with no accounts — the route's body is then unchanged", () => {
    const m = meters([]);
    m.refresh(NOW);
    expect(m.readings(NOW)).toEqual([]);
  });

  it("reads a codex account from ITS home's rollouts", () => {
    const m = meters([CW]);
    m.refresh(NOW);
    expect(codexHomesRead).toEqual(["/h/codex-work"]);
    expect(m.readings(NOW)).toMatchObject([{ id: "cw", agent: "codex", limits: LIMITS }]);
  });

  it("probes a claude account under its home, and files its report under it", () => {
    const m = meters([WORK]);
    m.refresh(NOW);
    expect(probes.map((p) => [p.account, p.home])).toEqual([["work", "/h/claude-work"]]);
    expect(m.readings(NOW)).toMatchObject([{ id: "work", probing: true, limits: null }]);
    m.reportClaudeStatus("work", { limits: LIMITS, afterApiResponse: true }, NOW);
    expect(m.readings(NOW)).toMatchObject([{ id: "work", limits: LIMITS, probe: "ok" }]);
  });

  it("follows the LOGIN, not the id: an id moved to another home does not keep the old reading", () => {
    let accounts = [WORK];
    const m = meters([], { accounts: () => accounts });
    m.reportClaudeStatus("work", { limits: LIMITS, afterApiResponse: true }, NOW);
    expect(m.readings(NOW)[0]?.limits).toEqual(LIMITS);
    accounts = [{ ...WORK, home: "/h/claude-other" }];
    expect(m.readings(NOW)[0]?.limits).toBeNull();
  });

  it("drops a report for an id that is not a configured claude account", () => {
    const m = meters([WORK, CW]);
    m.reportClaudeStatus("cw", { limits: LIMITS, afterApiResponse: true }, NOW);
    m.reportClaudeStatus("nobody", { limits: LIMITS, afterApiResponse: true }, NOW);
    expect(m.readings(NOW).map((r) => r.limits)).toEqual([null, null]);
  });

  // On the real clock: a settled probe is stamped with Date.now(), as in production.
  it("counts a probe that never answered as a failure, and backs off", () => {
    const m = meters([WORK]);
    const start = Date.now();
    m.refresh(start);
    probes[0]?.settle("trust-prompt");
    expect(m.readings(start)).toMatchObject([{ probing: false, probe: "no-report", probeStall: "trust-prompt" }]);
    m.refresh(start + 1_000);
    expect(probes).toHaveLength(1);
  });
});

describe("the route and an account's probe", () => {
  const app = (accounts: ReturnType<typeof meters> | undefined) => {
    const store = createRateLimitStore();
    const server = express();
    server.use(express.json());
    mountRateLimitRoutes(server, {
      store,
      refreshCodex: () => {},
      startProbe: () => {},
      claudeAvailable: () => false,
      now_ms: () => NOW,
      ...(accounts ? { accounts } : {}),
    });
    return { server, store };
  };
  const post = async (server: express.Express, url: string) => {
    const listener = server.listen(0);
    const address = listener.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      return await fetch(`http://127.0.0.1:${port}${url}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(WITH_WINDOWS),
      });
    } finally {
      listener.close();
    }
  };

  it("files an account's statusLine under the account and leaves the default store alone", async () => {
    const m = meters([WORK]);
    const { server, store } = app(m);
    await post(server, "/api/rate-limits?account=work");
    expect(m.readings(NOW)[0]?.limits).not.toBeNull();
    expect(store.snapshot().claude).toBeUndefined();
  });

  it("drops a report naming a malformed account rather than counting it as the default's", async () => {
    const { server, store } = app(meters([WORK]));
    await post(server, "/api/rate-limits?account=Not%20An%20Id");
    expect(store.snapshot().claude).toBeUndefined();
  });

  it("adds `accounts` to the body only when there is one", async () => {
    const body = async (accounts: AgentAccount[]): Promise<Record<string, unknown>> => {
      const parsed: unknown = await (await post(app(meters(accounts)).server, "/api/rate-limits/refresh")).json();
      return isRecord(parsed) ? parsed : {};
    };
    expect(Object.keys(await body([]))).not.toContain("accounts");
    expect((await body([CW])).accounts).toMatchObject([{ id: "cw", label: "Codex work", agent: "codex" }]);
  });

  it("points the probe's statusLine at its account, and the default's at nothing new", () => {
    expect(statusLineCommand("localhost", 1, "work")).toContain("/api/rate-limits?account=work ");
    expect(statusLineCommand("localhost", 1)).toContain("/api/rate-limits ");
    expect(statusLineCommand("localhost", 1, "bad id; rm")).not.toContain("account=");
  });

  it("caches each login in a file of its own, beside the default's", () => {
    expect(path.basename(rateLimitCacheFile())).toBe("rate-limits.json");
    expect(path.basename(rateLimitCacheFile("claude:/h/claude-work"))).toMatch(/^rate-limits-login-[0-9a-f]{16}\.json$/);
    expect(rateLimitCacheFile("claude:/h/a")).not.toBe(rateLimitCacheFile("claude:/h/b"));
  });
});
