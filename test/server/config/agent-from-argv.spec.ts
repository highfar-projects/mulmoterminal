// @vitest-environment node
import { describe, it, expect } from "vitest";
import { agentFromArgv, declaresAgent } from "../../../server/config/agent-from-argv.js";
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

// One parser for one flag. The launcher accepts both spellings, and a second copy written here
// accepted only the spaced one — invisible on the normal path, because the launcher re-emits that
// form, and silently wrong for the hand-run server this function exists to serve.
describe("agentFromArgv reads the same flag the launcher writes", () => {
  it.each([...TERMINAL_AGENTS])("reads --agent=%s, the joined form", (agent) => {
    expect(agentFromArgv(["--port", "8080", `--agent=${agent}`])).toBe(agent);
  });

  it("answers null for a joined form naming nothing known", () => {
    expect(agentFromArgv(["--agent=clyde"])).toBeNull();
    expect(agentFromArgv(["--agent="])).toBeNull();
  });

  it.each([
    ["spaced", ["--agent", "codex"], true],
    ["joined", ["--agent=codex"], true],
    ["unusable but present", ["--agent=clyde"], true],
    ["valueless", ["--agent"], true],
    ["absent", ["--port", "8080"], false],
  ])("notices a %s declaration, so an unusable one can be reported", (_label, argv, declared) => {
    expect(declaresAgent(argv)).toBe(declared);
  });
});
