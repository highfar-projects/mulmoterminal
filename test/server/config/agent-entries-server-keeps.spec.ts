// @vitest-environment node
//
// #2620. What Settings builds for a custom agent or an account is what the server keeps, unchanged —
// otherwise the list would show one entry and the echo another. In test/server because the
// sanitizers live in server code, which the app project that type-checks test/src cannot import.
import { describe, it, expect } from "vitest";
import { ACCOUNT_AGENTS } from "../../../common/agentAccounts";
import { buildAccount, buildCustomAgent } from "../../../common/agentEntries";
import { sanitizeAccounts, sanitizeCustomAgents, sanitizeProviders } from "../../../server/config/app-config";
import { buildProvider } from "../../../common/providerEntries";

const LABELS = ["Kimi K3", "Claude", "仕事", "  spaced  ", "a".repeat(24), "GLM 5.2 (fast)", "--x--"];
const HOMES = ["~/.claude-w", "/abs/home", "C:\\Users\\me\\.codex"];
const ACCOUNT_CASES = ACCOUNT_AGENTS.flatMap((agent) => HOMES.flatMap((home) => LABELS.map((label) => ({ agent, home, label }))));

describe("entries Settings builds survive the server's sanitizers", () => {
  it("custom agents", () => {
    LABELS.forEach((label) => {
      const built = buildCustomAgent(label, " ollama launch claude --model m -- ", []);
      if ("entry" in built) expect(sanitizeCustomAgents([built.entry])).toEqual([built.entry]);
    });
  });

  it("accounts, for every agent and home form", () => {
    ACCOUNT_CASES.forEach(({ agent, home, label }) => {
      const built = buildAccount(label, agent, home, []);
      if ("entry" in built) expect(sanitizeAccounts([built.entry])).toEqual([built.entry]);
    });
  });

  it("builds an entry for every label above", () => {
    LABELS.forEach((label) => expect("entry" in buildCustomAgent(label, "x", [])).toBe(true));
    ACCOUNT_CASES.forEach(({ agent, home, label }) => expect("entry" in buildAccount(label, agent, home, [])).toBe(true));
  });

  it("providers, with and without a budget and a model list", () => {
    [
      {
        label: "Moonshot",
        baseUrl: "https://api.moonshot.ai/anthropic",
        tokenEnv: "MOONSHOT_API_KEY",
        models: "kimi-k3, kimi-k3-thinking",
        maxOutputTokens: "16000",
      },
      { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/", tokenEnv: "OPENROUTER_API_KEY", models: "", maxOutputTokens: "" },
      { label: "Local", baseUrl: "http://localhost:4000", tokenEnv: "LOCAL_KEY", models: "opus[1m]", maxOutputTokens: "32000" },
    ].forEach((draft) => {
      const built = buildProvider(draft, []);
      expect("entry" in built).toBe(true);
      if ("entry" in built) expect(sanitizeProviders([built.entry])).toEqual([built.entry]);
    });
  });
});
