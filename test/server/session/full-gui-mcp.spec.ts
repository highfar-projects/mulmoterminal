// @vitest-environment node
// Which sessions carry the whole GUI MCP, and — the point of the file — which do NOT.
//
// PR2 gives a grid cell running in the workspace the surface the single view has always had, and
// the follow-up extends that to every way of starting a terminal there — a codex cell, and a
// launcher chip running either agent. The constraint all of it is written under is that anything in
// a PROJECT directory keeps the behaviour it has today, exactly. That is an invariant, and an
// invariant nothing asserts is just a hope: this is the assertion.
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
const { launcherCommandWithClaudeGuiMcp } = await import("../../../server/session/launcher-gui-mcp.js");

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

  it("carries --mcp-config and --strict-mcp-config when it has the full GUI MCP", () => {
    const argv = args(true);
    expect(argv).toContain("--mcp-config");
    expect(argv[argv.indexOf("--mcp-config") + 1]).toBe("MCP_CONFIG");
    expect(argv).toContain("--strict-mcp-config");
    expect(argv).toContain("GUI_TOOLS");
  });

  it("carries NEITHER for a project-directory cell, so its own MCP config still loads", () => {
    // --strict-mcp-config is what makes ours the only source. Withholding both is precisely how a
    // grid cell keeps reaching the servers its directory registered — the mechanism the Canvas
    // depends on there.
    const argv = args(false);
    expect(argv).not.toContain("--mcp-config");
    expect(argv).not.toContain("--strict-mcp-config");
    expect(argv).toContain("GRID_TOOLS");
  });
});

// The third shape: a launcher CHIP, where the same three flags have to be inserted into a command
// line rather than appended to an argv. A chip running plain `claude` in the workspace had no
// Canvas at all while the cell beside it had every tool — that gap is what this closes.
describe("the command line a launcher chip ends up with", () => {
  const GUI = { mcpConfigPath: "/home/u/.mulmoterminal/settings/s-mcp.json", allowedTools: "mcp__mt__presentChart" };
  const rewrite = (command: string, gui: typeof GUI | null = GUI) => launcherCommandWithClaudeGuiMcp(command, gui, "darwin");

  it("gives a claude chip the same three flags a claude cell is spawned with", () => {
    expect(rewrite("claude")).toBe(
      `claude --mcp-config '/home/u/.mulmoterminal/settings/s-mcp.json' --strict-mcp-config --allowedTools 'mcp__mt__presentChart'`,
    );
  });

  // Directly after the program, never appended: claude's own trailing `--add-dir` is variadic, so
  // a flag placed after it would be swallowed as one more directory.
  it("inserts after the program and puts the user's own text back byte for byte", () => {
    expect(rewrite("claude --model opus  --resume x")).toContain("claude --mcp-config");
    expect(rewrite("claude --model opus  --resume x")).toMatch(/--strict-mcp-config --allowedTools '\S+' --model opus {2}--resume x$/);
  });

  // null is how a PROJECT-directory chip arrives — the route passes nothing there, so its claude
  // reads the directory's own MCP config exactly as it did before.
  it("leaves the command alone when there is no GUI MCP to give", () => {
    expect(rewrite("claude", null)).toBe("claude");
  });

  // The same recogniser the codex rewriter uses, and the same refusal to see through a wrapper:
  // this edits text the user wrote, so an unrecognised shape means leave it alone.
  it.each([["codex"], ["zsh"], ["yarn dev"], ["FOO=1 claude"], [""], ["   "]])("leaves %s alone", (command) => {
    expect(rewrite(command)).toBe(command);
  });
});
