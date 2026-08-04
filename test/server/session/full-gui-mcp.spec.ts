// @vitest-environment node
// Which sessions carry the whole GUI MCP, and — the point of the file — which do NOT.
//
// PR2 gives a grid cell running in the workspace the surface the single view has always had, and
// the follow-up extends that to a codex cell there too. The constraint all of it is written under
// is that anything in a PROJECT directory keeps the behaviour it has today, exactly. That is an
// invariant, and an invariant nothing asserts is just a hope: this is the assertion.
//
// A launcher CHIP was once a third shape here — its command line was rewritten to carry the same
// flags. It is not any more: a chip runs the user's command verbatim and this app never reads it,
// so there is nothing left to assert.
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = mkdtempSync(path.join(os.tmpdir(), "mt-fullgui-"));
const WORKSPACE = path.join(ROOT, "workspace");
const PROJECT = path.join(ROOT, "project");
mkdirSync(WORKSPACE, { recursive: true });
mkdirSync(PROJECT, { recursive: true });
const REAL_CLAUDE_CWD = process.env.CLAUDE_CWD;
process.env.CLAUDE_CWD = WORKSPACE;

const { carriesFullGuiMcp } = await import("../../../server/session/mcp-config.js");
const { buildClaudeArgs } = await import("../../../server/agents/claude-args.js");

afterAll(() => {
  if (REAL_CLAUDE_CWD === undefined) delete process.env.CLAUDE_CWD;
  else process.env.CLAUDE_CWD = REAL_CLAUDE_CWD;
  rmSync(ROOT, { recursive: true, force: true });
});

// `attachGuiMcp` is what the WIRE says: false for a grid cell (?gui=0), true for everything else.
const GRID_CELL = false;
const NOT_A_GRID_CELL = true;

describe("carriesFullGuiMcp", () => {
  it("does NOT give it to a grid cell in a project directory", () => {
    // The invariant. If this ever flips, every ordinary cell in the grid silently changes what
    // tools it has and where they come from.
    expect(carriesFullGuiMcp(GRID_CELL, PROJECT)).toBe(false);
  });

  it("gives it to a grid cell running in the workspace", () => {
    expect(carriesFullGuiMcp(GRID_CELL, WORKSPACE)).toBe(true);
  });

  it("gives it to a grid cell that named no directory — that IS the workspace", () => {
    expect(carriesFullGuiMcp(GRID_CELL, undefined)).toBe(true);
  });

  // A LAUNCHER chip has no wire flag — it is never the single view — so the cwd is the only thing
  // that can earn it, which is what the route passes `false` for. Same predicate, so a chip and the
  // cell beside it agree about which directory is special.
  it("answers for a launcher chip on the cwd alone", () => {
    expect(carriesFullGuiMcp(false, WORKSPACE)).toBe(true);
    expect(carriesFullGuiMcp(false, PROJECT)).toBe(false);
  });

  it("still gives it to everything that is not a grid cell, whatever the directory", () => {
    // The single view, and every chat spawned without a cell of its own (spawnBackgroundChat,
    // the translation worker, issue work). Unchanged: the wire flag alone decides these.
    expect(carriesFullGuiMcp(NOT_A_GRID_CELL, PROJECT)).toBe(true);
    expect(carriesFullGuiMcp(NOT_A_GRID_CELL, WORKSPACE)).toBe(true);
  });

  it("does NOT give it to a cell in a subdirectory of the workspace", () => {
    // Equality, not prefix — `{workspace}/foo` is an ordinary project.
    expect(carriesFullGuiMcp(GRID_CELL, path.join(WORKSPACE, "foo"))).toBe(false);
  });
});

// The other half: that the flag reaches the argv in the two shapes it is supposed to. Pinned
// against buildClaudeArgs rather than a spawn, so it needs no PTY.
describe("the argv each kind of session gets", () => {
  const args = (attachGuiMcp: boolean) =>
    buildClaudeArgs({
      model: null,
      sessionId: "s",
      resume: null,
      canResume: false,
      settings: "{}",
      permissionMode: "default",
      attachGuiMcp,
      mcpConfig: "MCP_CONFIG",
      allowedTools: attachGuiMcp ? "GUI_TOOLS" : "GRID_TOOLS",
      addDirs: [],
      appendedPrompt: null,
    });

  it("carries --mcp-config when it has the full GUI MCP, and nothing that isolates", () => {
    const argv = args(true);
    expect(argv).toContain("--mcp-config");
    expect(argv[argv.indexOf("--mcp-config") + 1]).toBe("MCP_CONFIG");
    expect(argv).toContain("GUI_TOOLS");
    // #1338 / #1385: our broker is ADDED to what the session reaches. Isolating to it took the
    // user's claude.ai connectors and their own MCP servers away with the directory's .mcp.json.
    expect(argv).not.toContain("--strict-mcp-config");
  });

  it("carries no --mcp-config for a project-directory cell, so its own MCP config supplies the tools", () => {
    // Withholding ours is how a grid cell keeps reaching the servers its directory registered —
    // the mechanism the Canvas depends on there.
    const argv = args(false);
    expect(argv).not.toContain("--mcp-config");
    expect(argv).not.toContain("--strict-mcp-config");
    expect(argv).toContain("GRID_TOOLS");
  });
});
