// @vitest-environment node
// bin/agent-install-guides.json is hand-edited data (#2230), so what it holds is checked here rather
// than trusted: a key that names no agent is a link nobody will ever see, and a malformed URL is a
// link that goes nowhere — both silent until a stuck user clicks it.
import { describe, it, expect } from "vitest";
import { AGENT_INSTALL_GUIDES, agentInstallGuide } from "../../bin/agent-install-guides.js";
import { TERMINAL_AGENTS, isTerminalAgent } from "../../common/sessionAgent.js";

const entries = Object.entries(AGENT_INSTALL_GUIDES);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("agent-install-guides.json", () => {
  it("names only hosted agents", () => {
    expect(entries.map(([agent]) => agent).filter((agent) => !isTerminalAgent(agent))).toEqual([]);
  });

  it.each(entries)("gives %s an https URL and the date it was checked", (_agent, entry) => {
    expect(Object.keys(entry).sort()).toEqual(["checked", "url"]);
    expect(new URL(entry.url).protocol).toBe("https:");
    expect(entry.checked).toMatch(ISO_DATE);
    expect(Number.isNaN(Date.parse(entry.checked))).toBe(false);
  });
});

describe("agentInstallGuide", () => {
  it.each(TERMINAL_AGENTS)("answers %s from the table", (agent) => {
    expect(agentInstallGuide(agent)).toBe(AGENT_INSTALL_GUIDES[agent]?.url ?? null);
  });

  // Not an own key of the table — including the ones every object inherits — is no guide at all.
  it.each(["shell", "", "gemini", "__proto__", "constructor", "toString"])("answers null for %j", (agent) => {
    expect(agentInstallGuide(agent)).toBeNull();
  });
});
