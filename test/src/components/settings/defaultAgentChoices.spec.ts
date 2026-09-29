import { describe, it, expect } from "vitest";
import { TERMINAL_AGENTS, type TerminalAgent } from "../../../../common/sessionAgent";
import { agentFromChoiceValue, choiceValue, defaultAgentChoices, UNSET_AGENT_VALUE } from "../../../../src/components/settings/defaultAgentChoices";

const enabled = (confirmed: readonly TerminalAgent[], current: TerminalAgent | null) =>
  defaultAgentChoices(new Set(confirmed), current)
    .filter((choice) => !choice.disabled)
    .map((choice) => choice.agent);

describe("defaultAgentChoices", () => {
  it("leads with 'not set', then every built-in agent in the picker's order", () => {
    const choices = defaultAgentChoices(new Set(TERMINAL_AGENTS), null);
    expect(choices.map((choice) => choice.agent)).toEqual([null, ...TERMINAL_AGENTS]);
    expect(choices[1]?.label).toBe("Claude");
  });

  it("enables exactly the agents the server confirmed, plus the current value", () => {
    expect(enabled(["claude", "grok"], "codex")).toEqual([null, "claude", "codex", "grok"]);
    expect(enabled(TERMINAL_AGENTS, null)).toEqual([null, ...TERMINAL_AGENTS]);
  });

  it("offers nothing new while the answer is loading or after it failed (nothing confirmed)", () => {
    expect(enabled([], null)).toEqual([null]);
    expect(enabled([], "codex")).toEqual(["codex"]);
  });

  it("disables 'not set' when claude is not confirmed, because 'not set' declares claude", () => {
    expect(enabled(["codex"], "codex")).toEqual(["codex"]);
    expect(enabled(["codex", "claude"], "codex")).toEqual([null, "claude", "codex"]);
  });
});

describe("choiceValue / agentFromChoiceValue", () => {
  it("round-trips every choice through a select's string value", () => {
    [null, ...TERMINAL_AGENTS].forEach((agent) => expect(agentFromChoiceValue(choiceValue(agent))).toBe(agent));
  });

  it("reads anything it did not write as 'not set'", () => {
    [UNSET_AGENT_VALUE, "shell", "Claude", "custom:foo", " codex"].forEach((value) => expect(agentFromChoiceValue(value)).toBeNull());
  });
});
