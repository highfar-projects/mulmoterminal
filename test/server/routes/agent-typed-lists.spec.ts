// @vitest-environment node
// The agent lists that the COMPILER cannot check, pinned so a seventh agent cannot slip past them.
//
// Adding copilot was a type error in eleven places and silently wrong in four more: `normalizeAgent`
// was a hand-written union, and three predicates enumerated "antigravity | grok | muse" — which
// meant a copilot session read CLAUDE's transcript, CLAUDE's prompt history, and was asked for tool
// groups it does not use. Codex found the first on #2063; the rest are the same class.
//
// Each is now DERIVED (from TERMINAL_AGENTS, or from guiMcpAgents' own membership) or stated as
// "not claude". This spec is what fails if any of them goes back to being a list.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os, { tmpdir } from "node:os";
import path from "node:path";

// A HOME of its own. `projectSessionsDir` resolves under `os.homedir()/.claude/projects`, so the
// fixture below would otherwise write into the real one — which is the user's data, and which a
// sandboxed reviewer could not create at all (it failed with EPERM in Codex's, round 4 of #2063).
const FAKE_HOME = mkdtempSync(path.join(tmpdir(), "mt-agent-lists-home-"));
vi.spyOn(os, "homedir").mockReturnValue(FAKE_HOME);
const { projectSessionsDir } = await import("../../../server/session/project-dir");
import { normalizeAgent } from "../../../server/routes/routeParams";
import { TERMINAL_AGENTS } from "../../../common/sessionAgent";
import { agentCarriesFullGuiMcp } from "../../../common/guiMcpAgents";

describe("normalizeAgent", () => {
  it("accepts every agent the app can launch — no list to forget", () => {
    for (const agent of TERMINAL_AGENTS) expect(normalizeAgent(agent)).toBe(agent);
  });

  it("falls back to claude for anything else, case included", () => {
    for (const raw of ["CODEX", "Copilot", "", null, undefined, ["codex"], 7, "shell"]) {
      expect(normalizeAgent(raw)).toBe("claude");
    }
  });
});

describe("the agents whose own logs are not parsed yet", () => {
  // A transcript really on disk, so the assertion can tell "answered empty because it did not read
  // claude's file" from "answered empty because there was no file". Without one, the test passes
  // with the old enumeration restored — measured, which is why it is written this way.
  const ID = "0f8b1f2c-4a1e-4b0a-9a3f-2c8d1e5a7b90";
  const CWD = path.join(tmpdir(), `mt-agent-list-${process.pid}`);
  const dir = projectSessionsDir(CWD);

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    const turn = [
      JSON.stringify({ type: "user", message: { role: "user", content: "what did I ask" } }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "this is claude's reply" }], stop_reason: "end_turn" },
      }),
    ].join("\n");
    writeFileSync(path.join(dir, `${ID}.jsonl`), turn + "\n", "utf8");
  });
  afterAll(() => rmSync(FAKE_HOME, { recursive: true, force: true }));

  it("reads claude's transcript for claude — the control", async () => {
    const { sessionLastTurn } = await import("../../../server/session/session-reads");
    expect((await sessionLastTurn(CWD, ID, "claude")).reply).toContain("claude's reply");
  });

  it("never falls into it for any other agent, however the id collides", async () => {
    const { sessionLastTurn } = await import("../../../server/session/session-reads");
    for (const agent of TERMINAL_AGENTS.filter((a) => a !== "claude" && a !== "codex")) {
      expect(await sessionLastTurn(CWD, ID, agent)).toEqual({ prompt: null, reply: null });
    }
  });
});

describe("which agents need the directory's registered tool groups", () => {
  it("is the complement of FULL_GUI_MCP_AGENTS, not a list of names", () => {
    // An agent handed the whole GUI MCP on a per-spawn flag has no use for them; one that reads its
    // MCP from a file in the directory does. Membership lives in common/guiMcpAgents.ts, so the
    // spawn path derives rather than enumerates.
    expect(agentCarriesFullGuiMcp("copilot")).toBe(true);
    expect(agentCarriesFullGuiMcp("claude")).toBe(true);
    expect(agentCarriesFullGuiMcp("codex")).toBe(true);
    expect(agentCarriesFullGuiMcp("grok")).toBe(false);
    expect(agentCarriesFullGuiMcp("antigravity")).toBe(false);
    expect(agentCarriesFullGuiMcp("muse")).toBe(false);
  });
});
