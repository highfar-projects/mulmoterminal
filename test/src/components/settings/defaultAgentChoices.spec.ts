import { describe, it, expect } from "vitest";
import { TERMINAL_AGENTS, type TerminalAgent } from "../../../../common/sessionAgent";
import { agentFromChoiceValue, choiceValue, defaultAgentChoices, UNSET_AGENT_VALUE } from "../../../../src/components/settings/defaultAgentChoices";

describe("defaultAgentChoices", () => {
  it("leads with 'not set', then every built-in agent in the picker's order", () => {
    const choices = defaultAgentChoices(new Set());
    expect(choices.map((choice) => choice.agent)).toEqual([null, ...TERMINAL_AGENTS]);
    expect(choices.every((choice) => !choice.disabled)).toBe(true);
    expect(choices[1]?.label).toBe("Claude");
  });

  it("disables exactly the agents this machine cannot start, and never 'not set'", () => {
    const unavailable = new Set<TerminalAgent>(["codex", "cursor"]);
    const disabled = defaultAgentChoices(unavailable).filter((choice) => choice.disabled);
    expect(disabled.map((choice) => choice.agent)).toEqual(["codex", "cursor"]);
  });

  it("still offers 'not set' when even claude is missing", () => {
    const choices = defaultAgentChoices(new Set(TERMINAL_AGENTS));
    expect(choices[0]).toEqual({ agent: null, label: null, disabled: false });
    expect(choices.slice(1).every((choice) => choice.disabled)).toBe(true);
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
