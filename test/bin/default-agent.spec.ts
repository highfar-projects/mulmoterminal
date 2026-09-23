// @vitest-environment node
//
// The start-up gate's decision, and the table it decides from (#2082). Pure on both sides, so every
// combination is asserted without a machine that happens to have or lack a given CLI — which is the
// point: the interesting cases are the ones this developer's machine cannot produce.
import { describe, it, expect } from "vitest";
import { AGENT_BIN_SPEC, agentBin, AGENT_INSTALL_HINT } from "../../bin/agent-bins.js";
import { configuredDefaultAgent, gateFor, isKnownAgent, missingAgentMessage, parseAgentArg, resolveDeclaredAgent } from "../../bin/default-agent.js";
import { AGENT_BINS } from "../../server/config/agent-bins.js";
import { TERMINAL_AGENTS } from "../../common/sessionAgent.js";

describe("the agent binary table", () => {
  // The guarantee the duplication is allowed to exist under: `bin/` is plain JS and runs before the
  // server, so it cannot import the adapters — but a table that drifts from them would gate
  // start-up on a different binary than the one the server then runs.
  it("resolves the same binary the server's AGENT_BINS does, for every agent", () => {
    expect(Object.keys(AGENT_BIN_SPEC).sort()).toEqual([...TERMINAL_AGENTS].sort());
    Object.keys(AGENT_BIN_SPEC).forEach((agent) => {
      expect(agentBin(agent, {}), `${agent} default binary`).toBe(AGENT_BINS[agent as keyof typeof AGENT_BINS]);
    });
  });

  // agy and cursor-agent are the commands; `antigravity` and `cursor` are what the app calls them.
  // Pinned because a table that quietly used the agent id would look right and find nothing.
  it("keeps the ids whose command is spelled differently", () => {
    expect(agentBin("antigravity", {})).toBe("agy");
    expect(agentBin("cursor", {})).toBe("cursor-agent");
  });

  it("honours each agent's <AGENT>_BIN override", () => {
    Object.entries(AGENT_BIN_SPEC).forEach(([agent, spec]) => {
      expect(agentBin(agent, { [spec.env]: "/somewhere/else" }), `${agent} via ${spec.env}`).toBe("/somewhere/else");
    });
  });

  it("answers null for a name that is not an agent, rather than inventing a command", () => {
    expect(agentBin("nonsense", {})).toBeNull();
    expect(isKnownAgent("nonsense")).toBe(false);
    expect(isKnownAgent("codex")).toBe(true);
  });

  // An install line that is wrong is worse than none — it is the one thing a stuck user pastes.
  it("only claims an install command for the agents this repo documents one for", () => {
    expect(Object.keys(AGENT_INSTALL_HINT).sort()).toEqual(["claude", "codex"]);
  });
});

describe("parseAgentArg", () => {
  it.each([
    [["--agent", "codex"], "codex"],
    [["--agent=codex"], "codex"],
    [["--port", "8080", "--agent", "grok"], "grok"],
    [["--no-open"], null],
    [[], null],
  ])("reads %j as %j", (args, expected) => {
    expect(parseAgentArg(args)).toBe(expected);
  });

  // "" is a usage error, NOT "no preference": silently ignoring a bare --agent would start the app
  // on an agent the user did not ask for, having told them nothing.
  it.each([[["--agent"]], [["--agent", "--port", "8080"]]])("reads a valueless %j as an empty string, not null", (args) => {
    expect(parseAgentArg(args)).toBe("");
  });
});

describe("resolveDeclaredAgent", () => {
  it("lets the flag beat the config file", () => {
    expect(resolveDeclaredAgent({ cliAgent: "codex", configAgent: "grok" })).toBe("codex");
  });

  it("falls back to the config file when there is no flag", () => {
    expect(resolveDeclaredAgent({ configAgent: "grok" })).toBe("grok");
  });

  it.each([[{}], [{ cliAgent: null, configAgent: null }], [{ cliAgent: "" }], [{ configAgent: "" }]])("declares nothing for %j", (input) => {
    expect(resolveDeclaredAgent(input)).toBeNull();
  });
});

describe("gateFor", () => {
  // The rule of the issue: Claude Code stays required until something says otherwise.
  it("requires claude when nothing is declared", () => {
    expect(gateFor(null)).toEqual({ agent: "claude", required: true, declared: false });
  });

  it("requires the DECLARED agent instead, and stops asking about claude", () => {
    expect(gateFor("codex")).toEqual({ agent: "codex", required: true, declared: true });
  });
});

describe("configuredDefaultAgent", () => {
  it.each([
    [{ defaultAgent: "codex" }, "codex"],
    [{ defaultAgent: "  grok  " }, "grok"],
    [{ defaultAgent: "" }, null],
    [{ defaultAgent: 5 }, null],
    [{}, null],
    [null, null],
    [[], null],
  ])("reads %j as %j", (parsed, expected) => {
    expect(configuredDefaultAgent(parsed)).toBe(expected);
  });

  // Returned as-is rather than dropped: the caller reports the typo by name. Swallowing it would
  // start the app on claude while the user believed they had configured something else.
  it("hands back an unknown name so the caller can name it", () => {
    expect(configuredDefaultAgent({ defaultAgent: "clyde" })).toBe("clyde");
  });
});

describe("missingAgentMessage", () => {
  // What the user asked for (#2082): the terminal says the short version and the web page has the
  // rest. Both languages, because the guide is bilingual and a Japanese reader should not have to
  // guess that a ja page exists.
  it("tells an undeclared user how to skip the check, and links the guide", () => {
    const text = missingAgentMessage(gateFor(null), "claude").join("\n");
    expect(text).toContain("Claude Code CLI not found");
    expect(text).toContain("--agent codex");
    expect(text).toContain('"defaultAgent"');
    // The SECTION, not the index — a stuck reader should land on the answer, not the front page.
    expect(text).toContain("guide/en/agents.html#default-agent");
    expect(text).toContain("guide/ja/agents.html#default-agent");
  });

  // A declared agent's failure is a different sentence: they already chose, so repeating the
  // choice back at them is noise. What they need is which command was looked for.
  it("names the declared agent and its override variable, and does not re-offer the flag", () => {
    const text = missingAgentMessage(gateFor("grok"), "grok").join("\n");
    expect(text).toContain("grok is set as the default agent");
    expect(text).toContain("GROK_BIN");
    expect(text).not.toContain("--agent codex");
  });

  it("names the binary it actually looked for, not the agent id", () => {
    expect(missingAgentMessage(gateFor("cursor"), "cursor-agent").join("\n")).toContain('"cursor-agent"');
  });
});
