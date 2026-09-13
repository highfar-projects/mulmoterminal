import { describe, it, expect } from "vitest";
import { buildCopilotArgs } from "../../../server/agents/copilot-args.js";

const SESSION = "0f8b1f2c-4a1e-4b0a-9a3f-2c8d1e5a7b90";

describe("buildCopilotArgs", () => {
  it("always passes --session-id, because that flag both mints and resumes", () => {
    // The measured behaviour this whole adapter rests on (copilot 1.0.83): the same flag creates a
    // session under our uuid and resumes it later. A second, resume-shaped flag would be a bug.
    expect(buildCopilotArgs({ sessionId: SESSION })).toEqual(["--session-id", SESSION]);
  });

  it("never emits --resume, which is the interactive picker and refuses a prompt", () => {
    const args = buildCopilotArgs({ sessionId: SESSION, model: "gpt-5", allowAllTools: true, initialPrompt: "hi" });
    expect(args).not.toContain("--resume");
    expect(args).not.toContain("-r");
  });

  it("auto-approves tools only when asked", () => {
    expect(buildCopilotArgs({ sessionId: SESSION, allowAllTools: true })).toContain("--allow-all-tools");
    expect(buildCopilotArgs({ sessionId: SESSION })).not.toContain("--allow-all-tools");
  });

  it("passes the GUI MCP payload through --additional-mcp-config, unquoted and whole", () => {
    const json = '{"mcpServers":{"mt":{"type":"http","url":"http://127.0.0.1:7654/api/mcp/x"}}}';
    const args = buildCopilotArgs({ sessionId: SESSION, mcpConfig: json });
    expect(args[args.indexOf("--additional-mcp-config") + 1]).toBe(json);
  });

  it("seeds with --interactive, not -p: -p runs the prompt and EXITS, which kills the cell", () => {
    const args = buildCopilotArgs({ sessionId: SESSION, initialPrompt: "run the thing" });
    expect(args).toContain("--interactive");
    expect(args).not.toContain("-p");
    expect(args).not.toContain("--prompt");
    // Last, so nothing can be read as part of it.
    expect(args[args.length - 1]).toBe("run the thing");
  });

  it("omits every optional flag when nothing asks for it", () => {
    expect(buildCopilotArgs({ sessionId: SESSION, model: null, mcpConfig: null, initialPrompt: null })).toEqual(["--session-id", SESSION]);
  });
});
