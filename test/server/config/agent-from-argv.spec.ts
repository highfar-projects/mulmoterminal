// @vitest-environment node
import { describe, it, expect } from "vitest";
import { agentFromArgv } from "../../../server/config/agent-from-argv.js";
import { TERMINAL_AGENTS } from "../../../common/sessionAgent.js";

// The launcher's channel for the default agent. argv rather than the environment, because the
// server hands its environment to every PTY it spawns — the shape of #955 and #1857.
describe("agentFromArgv", () => {
  it.each([...TERMINAL_AGENTS])("reads --agent %s", (agent) => {
    expect(agentFromArgv(["--port", "8080", "--agent", agent])).toBe(agent);
  });

  it.each([
    ["absent", ["--port", "8080"]],
    ["valueless", ["--agent"]],
    ["followed by another flag", ["--agent", "--port"]],
    ["an unknown name", ["--agent", "clyde"]],
  ])("answers null when it is %s, so the config file still decides", (_label, argv) => {
    expect(agentFromArgv(argv)).toBeNull();
  });
});
