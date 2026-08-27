// @vitest-environment node
// What the launcher adds to the server's environment — and, the reason this file exists, what
// it must NOT add. The server hands its own environment to every PTY it spawns, so anything
// set here is set in every terminal of every cell: NODE_ENV=production shipped from the first
// npx release until #955, where yarn v1 read it and installed without devDependencies while
// still printing "Done". PORT left by the same route until #1857, where a dev server started
// in a cell read it and tried to take MulmoTerminal's own port.
import { describe, it, expect } from "vitest";
import { serverSpawnEnv } from "../../bin/cli-args.js";

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
