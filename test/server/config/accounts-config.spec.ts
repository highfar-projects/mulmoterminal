// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sanitizeAccounts } from "../../../server/config/app-config";
import { isAgentAccount } from "../../../common/agentAccounts";

const work = { id: "work", label: "Work", agent: "claude", home: "~/.claude-work" };

describe("sanitizeAccounts (#2215)", () => {
  it("keeps a well-formed entry for each agent", () => {
    const personal = { id: "personal", label: "Personal", agent: "codex", home: "/Users/me/.codex-personal" };
    expect(sanitizeAccounts([work, personal])).toEqual([work, personal]);
  });

  it("answers anything but an array with no accounts", () => {
    [undefined, null, {}, "work", 3].forEach((input) => expect(sanitizeAccounts(input)).toEqual([]));
  });

  it("trims, and caps the label", () => {
    const [account] = sanitizeAccounts([{ ...work, id: " work ", label: `  ${"x".repeat(40)}  `, home: " ~/.claude-work " }]);
    expect(account).toEqual({ ...work, label: "x".repeat(24) });
  });

  it("drops a relative home, which the CLI would resolve per cell directory", () => {
    ["claude-work", "./claude-work", "../x", "~", "~work", ""].forEach((home) => expect(sanitizeAccounts([{ ...work, home }])).toEqual([]));
  });

  it("accepts a Windows drive path", () => {
    expect(sanitizeAccounts([{ ...work, home: "C:\\Users\\me\\.claude-work" }])).toHaveLength(1);
  });

  it("drops an agent it cannot relocate, and a missing one", () => {
    expect(
      sanitizeAccounts([
        { ...work, agent: "grok" },
        { id: "x", label: "X", home: "~/.x" },
      ]),
    ).toEqual([]);
  });

  it("drops a bad id and a blank label", () => {
    ["Work", "-work", "w ork", "", "x".repeat(33)].forEach((id) => expect(sanitizeAccounts([{ ...work, id }])).toEqual([]));
    expect(sanitizeAccounts([{ ...work, label: "   " }])).toEqual([]);
  });

  it("keeps the first of two entries sharing an id", () => {
    expect(sanitizeAccounts([work, { ...work, label: "Second" }])).toEqual([work]);
  });

  it("stops at eight", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...work, id: `a${i}` }));
    expect(sanitizeAccounts(many).map((a) => a.id)).toEqual(["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
  });

  it("agrees with the guard the browser uses", () => {
    const rows = [work, { ...work, home: "rel" }, { ...work, agent: "grok" }, { ...work, id: "Bad" }];
    rows.forEach((row) => expect(isAgentAccount(row)).toBe(sanitizeAccounts([row]).length === 1));
  });
});

// Fork-only: the fork's accounts predate upstream's and were Claude-only, with the home under
// `configDir` and an optional token env var NAME. Both keep working on upstream's shape.
describe("sanitizeAccounts — the fork's own shape", () => {
  it("reads a legacy `configDir` entry as a claude account", () => {
    expect(sanitizeAccounts([{ id: "work", label: "Work", configDir: "~/.claude-work" }])).toEqual([work]);
  });

  it("prefers `home` when both are written", () => {
    expect(sanitizeAccounts([{ ...work, configDir: "/elsewhere" }])).toEqual([work]);
  });

  it("keeps a claude account's token env var name, and drops it for codex or a malformed name", () => {
    expect(sanitizeAccounts([{ ...work, oauthTokenEnvVar: " WORK_TOKEN " }])).toEqual([{ ...work, oauthTokenEnvVar: "WORK_TOKEN" }]);
    expect(sanitizeAccounts([{ ...work, oauthTokenEnvVar: "not a name" }])).toEqual([work]);
    const codex = { id: "cx", label: "Cx", agent: "codex", home: "~/.codex-cx" };
    expect(sanitizeAccounts([{ ...codex, oauthTokenEnvVar: "CX_TOKEN" }])).toEqual([codex]);
  });

  it("agrees with the browser's guard on an entry carrying a token name", () => {
    sanitizeAccounts([{ ...work, oauthTokenEnvVar: "WORK_TOKEN" }]).forEach((account) => expect(isAgentAccount(account)).toBe(true));
  });
});
