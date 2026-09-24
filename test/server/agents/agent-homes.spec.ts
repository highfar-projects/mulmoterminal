// @vitest-environment node
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TERMINAL_AGENTS, type TerminalAgent } from "../../../common/sessionAgent.js";
import { agentDefaultHome, agentHome } from "../../../server/agents/agent-homes.js";
import { codexSessionsRoot } from "../../../server/agents/codex-session.js";
import { codexSessionsDir } from "../../../server/agents/codex-rollout.js";
import { claudeHistoryFile, claudeProjectsRoot, claudeUserSkillsDir, encodeProjectDirName, projectSessionsDir } from "../../../server/session/project-dir.js";
import { takeScratchHome, type ScratchHome } from "../../support/scratchHome.js";

// What each agent itself reads, and where it writes by default. A row changing here changes where
// this server looks for an agent's sessions, so it is pinned rather than read back from the table.
const CONTRACT: Record<TerminalAgent, { envVar: string; honoured: boolean; segments: string[] }> = {
  claude: { envVar: "CLAUDE_CONFIG_DIR", honoured: false, segments: [".claude"] },
  codex: { envVar: "CODEX_HOME", honoured: true, segments: [".codex"] },
  antigravity: { envVar: "ANTIGRAVITY_HOME", honoured: true, segments: [".gemini", "antigravity-cli"] },
  grok: { envVar: "GROK_HOME", honoured: true, segments: [".grok"] },
  muse: { envVar: "MUSE_HOME", honoured: true, segments: [".local", "share", "muse"] },
  copilot: { envVar: "COPILOT_HOME", honoured: true, segments: [".copilot"] },
  cursor: { envVar: "CURSOR_HOME", honoured: false, segments: [".cursor"] },
};

const ELSEWHERE = path.join(path.sep, "relocated", "home");

let home: ScratchHome;
beforeEach(() => {
  home = takeScratchHome("agent-homes-");
  Object.values(CONTRACT).forEach(({ envVar }) => vi.stubEnv(envVar, undefined));
});
afterEach(() => {
  vi.unstubAllEnvs();
  home.release();
});

const defaultOf = (agent: TerminalAgent): string => path.join(home.path, ...CONTRACT[agent].segments);

describe.each(TERMINAL_AGENTS)("agentHome(%s)", (agent) => {
  const { envVar, honoured } = CONTRACT[agent];

  it("is the default under the user's home when the variable is unset", () => {
    expect(agentHome(agent)).toBe(defaultOf(agent));
  });

  it("treats an empty variable as unset", () => {
    vi.stubEnv(envVar, "");
    expect(agentHome(agent)).toBe(defaultOf(agent));
  });

  it(honoured ? `follows ${envVar} when set` : `ignores ${envVar}`, () => {
    vi.stubEnv(envVar, ELSEWHERE);
    expect(agentHome(agent)).toBe(honoured ? ELSEWHERE : defaultOf(agent));
  });

  it("has a default that ignores the variable", () => {
    vi.stubEnv(envVar, ELSEWHERE);
    expect(agentDefaultHome(agent)).toBe(defaultOf(agent));
  });

  it("is not moved by another agent's variable", () => {
    Object.entries(CONTRACT)
      .filter(([other]) => other !== agent)
      .forEach(([, row]) => vi.stubEnv(row.envVar, ELSEWHERE));
    expect(agentHome(agent)).toBe(defaultOf(agent));
  });
});

describe("claude paths take the home as a parameter", () => {
  it("defaults to ~/.claude", () => {
    const claude = defaultOf("claude");
    expect(claudeProjectsRoot()).toBe(path.join(claude, "projects"));
    expect(claudeHistoryFile()).toBe(path.join(claude, "history.jsonl"));
    expect(claudeUserSkillsDir()).toBe(path.join(claude, "skills"));
  });

  it("builds every path under the home it is given", () => {
    const cwd = path.resolve("/ws/app");
    expect(claudeProjectsRoot(ELSEWHERE)).toBe(path.join(ELSEWHERE, "projects"));
    expect(projectSessionsDir(cwd, ELSEWHERE)).toBe(path.join(ELSEWHERE, "projects", encodeProjectDirName(cwd)));
    expect(claudeHistoryFile(ELSEWHERE)).toBe(path.join(ELSEWHERE, "history.jsonl"));
    expect(claudeUserSkillsDir(ELSEWHERE)).toBe(path.join(ELSEWHERE, "skills"));
  });
});

// Current behaviour, not the intended one: the rate-limit reader does not follow CODEX_HOME while
// the session reader does.
it("codexSessionsDir ignores CODEX_HOME while codexSessionsRoot follows it", () => {
  vi.stubEnv("CODEX_HOME", ELSEWHERE);
  expect(codexSessionsRoot()).toBe(path.join(ELSEWHERE, "sessions"));
  expect(codexSessionsDir()).toBe(path.join(defaultOf("codex"), "sessions"));
});
