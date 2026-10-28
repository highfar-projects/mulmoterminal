// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const spawnPty = vi.hoisted(() => vi.fn());

vi.mock("../../session/pty/pty-spawn.js", () => ({ spawnPty }));
vi.mock("../../infra/process/has-binary.js", () => ({ hasBinary: () => true }));
// A state directory of this spec's own, so the probe folder the service makes is never the machine's.
vi.mock("../../config/env.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config/env.js")>()),
  MULMOTERMINAL_HOME: mkdtempSync(path.join(tmpdir(), "mt-ratelimit-state-")),
}));
vi.mock("./rate-limit-persist.js", () => ({
  rateLimitCacheFile: () => "/nonexistent/rate-limits.json",
  readRateLimitCache: () => ({}),
  createRateLimitCacheWriter: () => () => {},
}));
// Calls the spawn closure the way the real probe does — with the cwd the service chose — so what the
// service hands to spawnPty is observable.
vi.mock("./rate-limit-probe.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rate-limit-probe.js")>();
  return { ...actual, startRateLimitProbe: vi.fn((deps: Parameters<typeof actual.startRateLimitProbe>[0]) => (deps.spawn(["--probe"], deps.cwd), () => {})) };
});

const { createRateLimitService, startHomeProbe } = await import("./rate-limit-service.js");
const { MULMOTERMINAL_HOME: STATE_DIR } = await import("../../config/env.js");

const PIN = { CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN: "1" };
const PROBE_CWD = path.join(STATE_DIR, "probe");

beforeEach(() => {
  spawnPty.mockReset();
  rmSync(PROBE_CWD, { recursive: true, force: true });
});
afterAll(() => rmSync(STATE_DIR, { recursive: true, force: true }));

describe("the usage probes pin the classic renderer (#2936)", () => {
  it("the default login's probe passes the pin to spawnPty", () => {
    createRateLimitService().startProbe();

    expect(spawnPty).toHaveBeenCalledTimes(1);
    expect(spawnPty.mock.calls[0].slice(1)).toEqual([["--probe"], PROBE_CWD, [], PIN]);
  });

  it("an account's probe keeps its login variable, its unset list, and the pin", () => {
    startHomeProbe("/acct", "key", () => {}, ["CLAUDE_CODE_OAUTH_TOKEN"], { CLAUDE_CONFIG_DIR: "/acct" });

    expect(spawnPty).toHaveBeenCalledTimes(1);
    expect(spawnPty.mock.calls[0].slice(1)).toEqual([["--probe"], PROBE_CWD, ["CLAUDE_CODE_OAUTH_TOKEN"], { CLAUDE_CONFIG_DIR: "/acct", ...PIN }]);
  });
});

// The probe used to run in the workspace, which is wherever the launcher was started — and started
// in the home directory, that is the one folder Claude Code never saves trust for, so every probe met
// the dialog and accepting it changed nothing.
describe("the usage probes run in MulmoTerminal's own folder (#3200)", () => {
  it("starts every kind of probe in the probe folder, not the workspace, and makes the folder first", () => {
    expect(existsSync(PROBE_CWD)).toBe(false);
    createRateLimitService().startProbe();
    startHomeProbe("/acct", "key", () => {}, [], { CLAUDE_CONFIG_DIR: "/acct" });

    expect(spawnPty.mock.calls.map((call) => call[2])).toEqual([PROBE_CWD, PROBE_CWD]);
    expect(existsSync(PROBE_CWD)).toBe(true);
  });

  // The gauge names the folder in its trust-prompt note, so the route has to be told which it is.
  it("tells the routes the folder, so the gauge can name it", () => {
    expect(createRateLimitService().probeCwd).toBe(PROBE_CWD);
  });
});
