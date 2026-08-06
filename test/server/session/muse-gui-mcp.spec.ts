// muse reaches NO GUI MCP, and that has to be an answer both sides can read rather than a call
// site that happens not to attach one: the launcher form decides from the same list what it tells
// the user (#1423), and the server decides from it whether to read the directory's registration at
// all. spawn-muse.ts therefore states it here instead of consulting the predicate and discarding
// the result.
import { describe, it, expect } from "vitest";
import { agentCarriesFullGuiMcp, FULL_GUI_MCP_AGENTS } from "../../../common/guiMcpAgents.js";
import { carriesFullGuiMcp } from "../../../server/session/mcp-config.js";

describe("muse and the GUI MCP", () => {
  it("carries no per-spawn MCP config, in the workspace or anywhere else", () => {
    expect(agentCarriesFullGuiMcp("muse")).toBe(false);
    expect(carriesFullGuiMcp(true, undefined, "muse")).toBe(false);
    expect([...FULL_GUI_MCP_AGENTS]).not.toContain("muse");
  });

  // The agents that DO get one, asserted beside it so a change to the list has to face both.
  it("leaves claude and codex carrying it", () => {
    expect(agentCarriesFullGuiMcp("claude")).toBe(true);
    expect(agentCarriesFullGuiMcp("codex")).toBe(true);
  });
});
