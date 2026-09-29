// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  CLAUDE_UPDATE_NATIVE,
  CLAUDE_UPDATE_NPM,
  claudeDrift,
  claudeDriftLines,
  claudeUpdateCommands,
  nodeDrift,
  nodeDriftLines,
  parseClaudeVersion,
} from "../../bin/version-drift.js";

// The shape of nodejs.org/dist/index.json: newest first, `lts` is a codename or false.
const RELEASES = [
  { version: "v26.10.0", lts: false },
  { version: "v25.9.0", lts: false },
  { version: "v24.21.0", lts: "Krypton" },
  { version: "v24.20.0", lts: "Krypton" },
  { version: "v23.11.1", lts: false },
  { version: "v22.23.0", lts: "Jod" },
  { version: "v22.22.0", lts: "Jod" },
];

describe("nodeDrift", () => {
  it("is behind the newest LTS of its own major", () => {
    expect(nodeDrift("24.19.0", RELEASES)).toEqual({ kind: "behind", latest: "24.21.0", sameMajor: true });
  });

  it("does not move an older LTS line to the newest major", () => {
    expect(nodeDrift("22.23.0", RELEASES)).toEqual({ kind: "current" });
    expect(nodeDrift("22.22.0", RELEASES)).toEqual({ kind: "behind", latest: "22.23.0", sameMajor: true });
  });

  it("is current at the newest LTS of its major", () => {
    expect(nodeDrift("24.21.0", RELEASES)).toEqual({ kind: "current" });
  });

  it("points a major with no LTS release at the newest LTS", () => {
    expect(nodeDrift("23.11.1", RELEASES)).toEqual({ kind: "behind", latest: "24.21.0", sameMajor: false });
  });

  it("leaves a Current release newer than every LTS alone", () => {
    expect(nodeDrift("26.10.0", RELEASES)).toEqual({ kind: "current" });
    expect(nodeDrift("25.1.0", RELEASES)).toEqual({ kind: "current" });
  });

  it("accepts the version with or without a leading v, in any order", () => {
    expect(nodeDrift("v24.19.0", [...RELEASES].reverse())).toEqual({ kind: "behind", latest: "24.21.0", sameMajor: true });
  });

  it.each([
    ["no payload", null],
    ["not an array", { version: "v24.21.0" }],
    ["an empty list", []],
    ["no LTS entries", [{ version: "v26.0.0", lts: false }]],
    ["malformed entries only", [null, 42, { lts: "Krypton" }, { version: 24, lts: "Krypton" }]],
  ])("is unknown for %s", (_label, releases) => {
    expect(nodeDrift("24.19.0", releases)).toEqual({ kind: "unknown" });
  });

  it("skips malformed entries beside valid ones", () => {
    expect(nodeDrift("24.19.0", [null, { lts: "x" }, ...RELEASES])).toEqual({ kind: "behind", latest: "24.21.0", sameMajor: true });
  });

  it("is unknown for an unreadable local version", () => {
    expect(nodeDrift("garbage", RELEASES)).toEqual({ kind: "unknown" });
  });
});

describe("claudeDrift", () => {
  it.each([
    ["2.1.200", "2.1.277", { kind: "behind", latest: "2.1.277" }],
    ["2.1.277", "2.1.277", { kind: "current" }],
    ["2.1.284", "2.1.277", { kind: "current" }], // on `latest`, ahead of `stable`
    ["2.1.99", "2.1.100", { kind: "behind", latest: "2.1.100" }], // numeric, not lexical
    [null, "2.1.277", { kind: "unknown" }],
    ["2.1.200", null, { kind: "unknown" }],
  ])("claudeDrift(%s, %s)", (local, stable, expected) => {
    expect(claudeDrift(local, stable)).toEqual(expected);
  });
});

describe("parseClaudeVersion", () => {
  it.each([
    ["2.1.284 (Claude Code)\n", "2.1.284"],
    ["  1.0.3", "1.0.3"],
    ["Claude Code 2.1.284", null],
    ["", null],
    [null, null],
    [undefined, null],
    ["error: unknown option", null],
  ])("parseClaudeVersion(%j) === %j", (stdout, expected) => {
    expect(parseClaudeVersion(stdout)).toBe(expected);
  });
});

describe("claudeUpdateCommands", () => {
  it("names claude update for the native installer", () => {
    expect(claudeUpdateCommands("/Users/me/.local/share/claude/versions/2.1.284")).toEqual([CLAUDE_UPDATE_NATIVE]);
  });

  it("names npm for a global npm install, on either separator", () => {
    expect(claudeUpdateCommands("/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js")).toEqual([CLAUDE_UPDATE_NPM]);
    expect(claudeUpdateCommands("C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js")).toEqual([CLAUDE_UPDATE_NPM]);
  });

  it.each([["/opt/homebrew/bin/claude"], [""], [null]])("offers both for an unrecognised path %j", (realPath) => {
    const commands = claudeUpdateCommands(realPath);
    expect(commands[0]).toBe(CLAUDE_UPDATE_NATIVE);
    expect(commands[1]).toContain(CLAUDE_UPDATE_NPM);
  });
});

describe("nodeDriftLines", () => {
  it("says nothing when current", () => {
    expect(nodeDriftLines({ kind: "current" }, { via: "nvm", commands: ["nvm install --lts"] })).toEqual([]);
  });

  it("lists the upgrade commands when behind", () => {
    const lines = nodeDriftLines({ kind: "behind", latest: "24.21.0", sameMajor: true }, { via: "nvm", commands: ["nvm install --lts"] });
    expect(lines[0]).toContain("Node 24.21.0 is out (latest 24.x LTS)");
    expect(lines[0]).toContain("To update with nvm:");
    expect(lines[1].trim()).toBe("nvm install --lts");
  });

  it("names the latest LTS for a major without one, and falls back to the download page", () => {
    const lines = nodeDriftLines({ kind: "behind", latest: "24.21.0", sameMajor: false }, { via: null, commands: [] });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("is the latest LTS");
    expect(lines[0]).toContain("https://nodejs.org/en/download");
  });

  it("says the check could not run when unknown", () => {
    expect(nodeDriftLines({ kind: "unknown" }, { via: null, commands: [] })[0]).toContain("could not check");
  });
});

describe("claudeDriftLines", () => {
  it("says nothing when current", () => {
    expect(claudeDriftLines({ kind: "current" }, "2.1.284", [CLAUDE_UPDATE_NATIVE])).toEqual([]);
  });

  it("names both versions and the command when behind", () => {
    const lines = claudeDriftLines({ kind: "behind", latest: "2.1.277" }, "2.1.200", [CLAUDE_UPDATE_NATIVE]);
    expect(lines[0]).toContain("2.1.200");
    expect(lines[0]).toContain("2.1.277");
    expect(lines[1].trim()).toBe(CLAUDE_UPDATE_NATIVE);
  });

  it("reports an unreadable local version before an unreachable registry", () => {
    expect(claudeDriftLines({ kind: "unknown" }, null, [])[0]).toContain("could not read the Claude Code version");
    expect(claudeDriftLines({ kind: "unknown" }, "2.1.200", [])[0]).toContain("could not check");
  });
});
