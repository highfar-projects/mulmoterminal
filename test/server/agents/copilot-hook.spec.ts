// @vitest-environment node
import { describe, it, expect } from "vitest";
import { copilotHookBody, COPILOT_HOOK_EVENTS } from "../../../server/agents/copilot-hook.js";

// Captured from copilot 1.0.83 on macOS, not invented: these are the payloads a real turn produced.
const SESSION = "48a9125f-633c-4619-9baa-2cab2c51d18a";
const CWD = "/tmp/probe";
const AGENT_STOP = { sessionId: SESSION, timestamp: 1789329287480, cwd: CWD, transcriptPath: "/tmp/t.jsonl", stopReason: "end_turn", stop_hook_active: false };
const PROMPT_SUBMITTED = { sessionId: SESSION, timestamp: 1789329210400, cwd: CWD, prompt: "reply with just: ok" };
const PRE_TOOL = { sessionId: SESSION, timestamp: 1789329286037, cwd: CWD, toolName: "apply_patch", toolArgs: "*** Begin Patch\n" };
const POST_TOOL = { ...PRE_TOOL, toolResult: "{'resultType': 'success'}" };
const PERMISSION_REQUEST = {
  hookName: "permissionRequest",
  sessionId: SESSION,
  timestamp: 1789329286045,
  cwd: CWD,
  toolName: "edit",
  toolInput: "{}",
  permissionSuggestions: [],
};

describe("copilotHookBody", () => {
  it("turns a finished turn into the Stop every downstream table is written against", () => {
    expect(copilotHookBody("agentStop", AGENT_STOP)).toMatchObject({ hook_event_name: "Stop", session_id: SESSION, cwd: CWD });
  });

  it("carries the prompt off a submitted turn, under claude's field name", () => {
    expect(copilotHookBody("userPromptSubmitted", PROMPT_SUBMITTED)).toMatchObject({ hook_event_name: "UserPromptSubmit", prompt: "reply with just: ok" });
  });

  it("renames copilot's tool fields to the ones tool-hook.ts reads", () => {
    expect(copilotHookBody("preToolUse", PRE_TOOL)).toMatchObject({ hook_event_name: "PreToolUse", tool_name: "apply_patch", tool_input: PRE_TOOL.toolArgs });
    expect(copilotHookBody("postToolUse", POST_TOOL)).toMatchObject({ hook_event_name: "PostToolUse", tool_response: POST_TOOL.toolResult });
  });

  it("DROPS permissionRequest, which is not the blocked-on-input signal its name suggests", () => {
    // Measured: it fires with --allow-all-tools set, 8 ms before postToolUse, on a turn where
    // nothing was ever asked. Mapping it to Notification would flag every tool call as needing the
    // user — which is the whole attention mechanism, inverted.
    expect(copilotHookBody("permissionRequest", PERMISSION_REQUEST)).toBeNull();
    expect(COPILOT_HOOK_EVENTS).not.toContain("permissionRequest");
  });

  it("answers null rather than half a body for an event it does not translate", () => {
    expect(copilotHookBody("somethingNew", AGENT_STOP)).toBeNull();
    expect(copilotHookBody(undefined, AGENT_STOP)).toBeNull();
  });

  it("answers null with no session id — the hook file is machine-global, so silence is the answer", () => {
    expect(copilotHookBody("agentStop", { ...AGENT_STOP, sessionId: undefined })).toBeNull();
    expect(copilotHookBody("agentStop", "not an object")).toBeNull();
  });

  it("registers exactly the events it can translate, so nothing posts a body nothing reads", () => {
    for (const event of COPILOT_HOOK_EVENTS) {
      expect(copilotHookBody(event, { sessionId: SESSION })).not.toBeNull();
    }
  });
});
