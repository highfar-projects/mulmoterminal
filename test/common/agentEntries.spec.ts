// @vitest-environment node
import { describe, it, expect } from "vitest";
import { CUSTOM_AGENTS_MAX, isCustomAgentId, type CustomAgent } from "../../common/customAgents";
import { ACCOUNTS_MAX, isAccountId, type AgentAccount } from "../../common/agentAccounts";
import { buildAccount, buildCustomAgent, slugFromLabel, uniqueSlug } from "../../common/agentEntries";

describe("slugFromLabel", () => {
  it("lowercases and joins words with one dash", () => {
    expect(slugFromLabel("Kimi K3")).toBe("kimi-k3");
    expect(slugFromLabel("  GLM 5.2 (fast)  ")).toBe("glm-5-2-fast");
    expect(slugFromLabel("work_account")).toBe("work_account");
  });

  it("starts with a letter or digit and never ends on a dash", () => {
    expect(slugFromLabel("--Nemotron--")).toBe("nemotron");
    expect(slugFromLabel("_x")).toBe("x");
  });

  it("gives nothing for a label with no Latin letters or digits", () => {
    ["仕事", "", "   ", "---", "!!"].forEach((label) => expect(slugFromLabel(label)).toBe(""));
  });

  it("keeps a mixed label's Latin part", () => {
    expect(slugFromLabel("仕事 Work")).toBe("work");
  });

  it("stays within 32 characters and matches the id rule whenever it gives anything", () => {
    ["a".repeat(80), "Very Long Label For A Custom Agent Here", "x-".repeat(40), "Ölçü 42", "a b c"].forEach((label) => {
      const slug = slugFromLabel(label);
      expect(slug.length).toBeLessThanOrEqual(32);
      if (slug) expect(isAccountId(slug)).toBe(true);
    });
  });
});

describe("uniqueSlug", () => {
  it("numbers from 2, and cuts the base to make room for the suffix", () => {
    const taken = new Set(["work", "work-2"]);
    expect(uniqueSlug("work", (id) => !taken.has(id), 5)).toBe("work-3");
    const long = "a".repeat(32);
    expect(uniqueSlug(long, (id) => id !== long, 3)).toBe(`${"a".repeat(30)}-2`);
  });

  it("gives null when every try is refused", () => {
    expect(uniqueSlug("x", () => false, 4)).toBeNull();
  });
});

const agent = (id: string): CustomAgent => ({ id, label: id, agent: "claude", command: "run" });

describe("buildCustomAgent", () => {
  it("builds an entry the server keeps unchanged", () => {
    const built = buildCustomAgent("  Kimi K3 ", " ollama launch claude --model kimi -- ", []);
    expect(built).toEqual({ entry: { id: "kimi-k3", label: "Kimi K3", agent: "claude", command: "ollama launch claude --model kimi --" } });
  });

  it("never takes a built-in agent's name, or an id already used", () => {
    const claude = buildCustomAgent("Claude", "x", []);
    expect("entry" in claude && claude.entry.id).toBe("claude-2");
    const again = buildCustomAgent("Kimi", "x", [agent("kimi")]);
    expect("entry" in again && again.entry.id).toBe("kimi-2");
    if ("entry" in claude) expect(isCustomAgentId(claude.entry.id)).toBe(true);
  });

  it("gives a Japanese label a generic id", () => {
    const built = buildCustomAgent("仕事用", "x", [agent("agent")]);
    expect("entry" in built && built.entry.id).toBe("agent-2");
  });

  it("says what is wrong instead of building", () => {
    expect(buildCustomAgent("", "x", [])).toEqual({ problem: "label" });
    expect(buildCustomAgent("a".repeat(25), "x", [])).toEqual({ problem: "label" });
    expect(buildCustomAgent("Kimi", "  ", [])).toEqual({ problem: "command" });
    expect(buildCustomAgent("Kimi", "x".repeat(501), [])).toEqual({ problem: "command" });
    const full = Array.from({ length: CUSTOM_AGENTS_MAX }, (_, i) => agent(`a${i}`));
    expect(buildCustomAgent("Kimi", "x", full)).toEqual({ problem: "full" });
  });
});

const account = (id: string): AgentAccount => ({ id, label: id, agent: "claude", home: "~/.claude-x" });

describe("buildAccount", () => {
  it("builds an entry the server keeps unchanged", () => {
    const built = buildAccount(" Work ", "codex", " ~/.codex-work ", []);
    expect(built).toEqual({ entry: { id: "work", label: "Work", agent: "codex", home: "~/.codex-work" } });
  });

  it("refuses a home the server would drop", () => {
    ["", ".claude-work", "claude", "../x"].forEach((home) => expect(buildAccount("Work", "claude", home, [])).toEqual({ problem: "home" }));
    ["/Users/me/.claude-work", "~/.claude-work", "C:\\\\Users\\\\me\\\\.claude"].forEach((home) =>
      expect("entry" in buildAccount("Work", "claude", home, [])).toBe(true),
    );
  });

  it("numbers a repeated label, and stops at the limit", () => {
    const again = buildAccount("Work", "claude", "~/.w", [account("work")]);
    expect("entry" in again && again.entry.id).toBe("work-2");
    const full = Array.from({ length: ACCOUNTS_MAX }, (_, i) => account(`a${i}`));
    expect(buildAccount("Work", "claude", "~/.w", full)).toEqual({ problem: "full" });
  });
});
