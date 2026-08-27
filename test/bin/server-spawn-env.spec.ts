// @vitest-environment node
// What the launcher adds to the server's environment — and, the reason this file exists, what
// it must NOT add. The server hands its own environment to every PTY it spawns, so anything
// set here is set in every terminal of every cell: NODE_ENV=production shipped from the first
// npx release until #955, where yarn v1 read it and installed without devDependencies while
// still printing "Done". PORT left by the same route until #1857, where a dev server started
// in a cell read it and tried to take MulmoTerminal's own port.
import { describe, it, expect } from "vitest";
import { parsePortArg, serverSpawnEnv } from "../../bin/cli-args.js";

const CWD = "/Users/u/project";

describe("serverSpawnEnv", () => {
  it("adds the launch directory", () => {
    expect(serverSpawnEnv({ HOME: "/Users/u" }, CWD).CLAUDE_CWD).toBe(CWD);
  });

  it("carries the rest of the environment through", () => {
    const env = serverSpawnEnv({ HOME: "/Users/u", PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-x" }, CWD);
    expect(env.HOME).toBe("/Users/u");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-x");
  });

  // Regression (#955): the whole bug was one extra key here.
  it("does not invent a NODE_ENV", () => {
    const env = serverSpawnEnv({ HOME: "/Users/u" }, CWD);
    expect("NODE_ENV" in env).toBe(false);
    expect(Object.keys(env).sort()).toEqual(["CLAUDE_CWD", "HOME"]);
  });

  // Regression (#1857): the port travels in argv now (serverNodeArgs), because argv is not
  // inherited by the PTYs the server spawns.
  it("does not invent a PORT", () => {
    expect("PORT" in serverSpawnEnv({ HOME: "/Users/u" }, CWD)).toBe(false);
  });

  // The launcher decides what it ADDS. A user who runs their whole shell in one mode keeps it —
  // stripping it here would be the same bug pointed the other way.
  it.each(["production", "development", "test"])("passes a user's own NODE_ENV=%s through untouched", (value) => {
    expect(serverSpawnEnv({ NODE_ENV: value }, CWD).NODE_ENV).toBe(value);
  });

  // Same rule for PORT, and the half of #1857 that #1861 asked for: a PORT the user exported is
  // theirs, and every terminal in every cell should see the one they set — not ours.
  it("passes a user's own PORT through untouched", () => {
    expect(serverSpawnEnv({ PORT: "3000" }, CWD).PORT).toBe("3000");
  });

  it("never mutates the environment it was given", () => {
    const original = { HOME: "/Users/u" };
    serverSpawnEnv(original, CWD);
    expect(original).toEqual({ HOME: "/Users/u" });
  });
});

// The two halves of the launcher's port decision, asserted TOGETHER — which is the only place
// the #1861/#1857 trade-off is visible. Codex read the passthrough above as the old injection
// still happening (round 1, P2); what distinguishes them is PROVENANCE, and provenance is a
// property of the pair, not of either function alone.
describe("what a launcher-chosen port leaves in the server's environment", () => {
  const DEFAULT_PORT = 34567;

  // The user's own variable, read as the request AND left alone. A cell then sees exactly what
  // the shell that launched us saw — which is what #1857 asked for. Stripping it here would be
  // #955's bug pointed the other way, and it would not free the port we are holding anyway.
  it("keeps a PORT the user exported, having taken it as the request", () => {
    const env = { HOME: "/Users/u", PORT: "34601" };
    expect(parsePortArg([], env, DEFAULT_PORT)).toEqual({ port: 34601, explicit: true });
    expect(serverSpawnEnv(env, CWD).PORT).toBe("34601");
  });

  // Regression (#1857): with no PORT in the user's shell, nothing invents one. The port the
  // launcher chose travels in argv (serverNodeArgs), which no pty inherits.
  it("adds no PORT of its own when the port came from --port", () => {
    const env = { HOME: "/Users/u" };
    expect(parsePortArg(["--port", "34601"], env, DEFAULT_PORT)).toEqual({ port: 34601, explicit: true });
    expect("PORT" in serverSpawnEnv(env, CWD)).toBe(false);
  });

  // And --port winning does NOT turn into a licence to strip: the user's variable is still theirs.
  it("keeps the user's PORT even when --port overrode it as the request", () => {
    const env = { HOME: "/Users/u", PORT: "3000" };
    expect(parsePortArg(["--port", "34601"], env, DEFAULT_PORT)).toEqual({ port: 34601, explicit: true });
    expect(serverSpawnEnv(env, CWD).PORT).toBe("3000");
  });
});
