// @vitest-environment node
//
// One property over every agent that takes a seed prompt as an ARGUMENT: whatever ends up on the
// command line can actually go on one.
//
// Stated once, here, rather than per agent — because that is how it went wrong. #1516 fixed the
// same class for `--append-system-prompt`, and each of these agents' own specs went on asserting
// the seed's argv POSITION, which tests the shape of the bug rather than the rule (#1518).
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildGrokArgs } from "../../../server/agents/grok-args.js";
import { buildAntigravityArgs } from "../../../server/agents/antigravity-args.js";
import { buildMuseArgs } from "../../../server/agents/muse-args.js";
import { codexifySkillSeed } from "../../../server/agents/codex-skills.js";
import { seedPromptArgument, cleanupSessionSettings } from "../../../server/session/session-settings.js";
import { resolvePtyLaunch } from "../../../server/infra/resolve-bin.js";

const SESSION = "seed-argv-spec-session";
const CWD = "C:\\work\\project";
const seedFileFor = (id: string) => path.join(os.homedir(), ".mulmoterminal", "settings", `${id}-seed.txt`);

afterEach(() => cleanupSessionSettings(SESSION));

// What the plugin routes actually hand a spawn. codexifySkillSeed puts a blank line between the
// skill line and the rest, so ANY skill seed with arguments is multi-line — not a corner case.
const SEED = codexifySkillSeed("/gh-review-loop 1517 をトリアージして");

// An npm-global install: the agent on PATH is a .cmd shim, so the launch goes through cmd.exe,
// whose command line has no encoding for a newline.
const asWindowsLaunch = (bin: string, args: string[]) =>
  resolvePtyLaunch(bin, args, "win32", "C:\\npm;C:\\Windows\\System32", "C:\\Windows\\System32\\cmd.exe", (candidate) =>
    new RegExp(`${bin}\\.cmd$|cmd\\.exe$`, "i").test(candidate),
  );

// Each agent's argv as a WINDOWS spawn builds it — the seed resolved the way the spawner resolves
// it, which is the step the bug was missing.
const windowsArgv = (): Array<[string, string[]]> => {
  const seed = seedPromptArgument(SESSION, SEED, "win32");
  return [
    ["grok", buildGrokArgs({ sessionId: "11111111-2222-4333-8444-555555555555", resume: null, model: "grok-4.5", skipPermissions: true, initialPrompt: seed })],
    ["agy", buildAntigravityArgs({ resume: null, model: "agy-1", skipPermissions: true, initialPrompt: seed })],
    ["muse", buildMuseArgs({ resume: null, workspace: CWD, model: "muse-spark-1.2", initialPrompt: seed })],
  ];
};

describe("a seed prompt on a Windows command line", () => {
  it("is multi-line for any skill seed with arguments — the reason this rule exists", () => {
    expect(SEED).toContain("\n");
  });

  // The regression itself: with the raw seed on argv this threw UnsafeArgumentError and the
  // session never started.
  it("can actually be put on a command line, for every agent that takes one", () => {
    for (const [agent, args] of windowsArgv()) {
      expect(() => asWindowsLaunch(agent, args), agent).not.toThrow();
    }
  });

  // Named per agent so a failure says WHICH argument, and so a future flag carrying free text
  // fails here rather than at a user's machine.
  it("carries no argument a command line cannot represent", () => {
    for (const [agent, args] of windowsArgv()) {
      expect(
        args.filter((arg) => /[\0\r\n]/.test(arg)),
        agent,
      ).toEqual([]);
    }
  });
});

describe("seedPromptArgument", () => {
  it("hands back a multi-line seed unchanged off Windows — nothing about that path moves", () => {
    expect(seedPromptArgument(SESSION, SEED, "darwin")).toBe(SEED);
    expect(existsSync(seedFileFor(SESSION))).toBe(false);
  });

  // The indirection is for the case that cannot work, not for Windows as such.
  it("hands back a single-line seed unchanged even on Windows", () => {
    expect(seedPromptArgument(SESSION, "/collect run", "win32")).toBe("/collect run");
    expect(existsSync(seedFileFor(SESSION))).toBe(false);
  });

  it("puts a multi-line seed in a file and names it in one line", () => {
    const argument = seedPromptArgument(SESSION, SEED, "win32");
    expect(argument).not.toContain("\n");
    expect(argument).toContain(seedFileFor(SESSION));
    // Verbatim: the whole point is that the agent gets the instruction it was given, not a
    // flattened paraphrase of it.
    expect(readFileSync(seedFileFor(SESSION), "utf8")).toBe(SEED);
  });

  it("is cleaned up with the session's other files", () => {
    seedPromptArgument(SESSION, SEED, "win32");
    expect(existsSync(seedFileFor(SESSION))).toBe(true);
    cleanupSessionSettings(SESSION);
    expect(existsSync(seedFileFor(SESSION))).toBe(false);
  });
});
