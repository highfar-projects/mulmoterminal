// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnPty = vi.hoisted(() => vi.fn());

vi.mock("../../session/pty/pty-spawn.js", () => ({ spawnPty }));
vi.mock("../../infra/process/has-binary.js", () => ({ hasBinary: () => true }));
vi.mock("./rate-limit-persist.js", () => ({
  rateLimitCacheFile: () => "/nonexistent/rate-limits.json",
  readRateLimitCache: () => ({}),
  createRateLimitCacheWriter: () => () => {},
}));
// Calls the spawn closure the way the real probe does, so what the service hands to spawnPty is observable.
vi.mock("./rate-limit-probe.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rate-limit-probe.js")>();
  return { ...actual, startRateLimitProbe: vi.fn((deps: Parameters<typeof actual.startRateLimitProbe>[0]) => (deps.spawn(["--probe"], "/work"), () => {})) };
});

const { createRateLimitService, startHomeProbe } = await import("./rate-limit-service.js");

const PIN = { CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN: "1" };

beforeEach(() => spawnPty.mockReset());

describe("the usage probes pin the classic renderer (#2936)", () => {
  it("the default login's probe passes the pin to spawnPty", () => {
    createRateLimitService().startProbe();

    expect(spawnPty).toHaveBeenCalledTimes(1);
    expect(spawnPty.mock.calls[0].slice(1)).toEqual([["--probe"], "/work", [], PIN]);
  });

  it("an account's probe keeps its login variable, its unset list, and the pin", () => {
    startHomeProbe("/acct", "key", () => {}, ["CLAUDE_CODE_OAUTH_TOKEN"], { CLAUDE_CONFIG_DIR: "/acct" });

    expect(spawnPty).toHaveBeenCalledTimes(1);
    expect(spawnPty.mock.calls[0].slice(1)).toEqual([["--probe"], "/work", ["CLAUDE_CODE_OAUTH_TOKEN"], { CLAUDE_CONFIG_DIR: "/acct", ...PIN }]);
  });
});
