// @vitest-environment node
// The copilot branch of /api/hook, pinned at the ROUTE rather than at the translation.
//
// copilot-hook.spec.ts proves the renaming; this proves the renaming is WIRED — that a copilot
// payload reaches the same effect table claude's hooks reach, and, just as importantly, that an
// ordinary claude request is not changed by the branch standing in front of it. Every claude hook
// in the product posts to this endpoint, so "does this branch cost claude anything" is the question
// a unit test of a pure function cannot answer (Codex review on #2063).
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountHookRoute } from "../../../server/routes/hook-routes";
import { lastPrompts } from "../../../server/session/registry";

vi.mock("../../../server/session/session-reads.js", () => ({ latestUserPrompt: vi.fn(async () => null) }));

const ID = "48a9125f-633c-4619-9baa-2cab2c51d18a";
const CWD = "/tmp/probe";

const deps = {
  setWorking: vi.fn(),
  setWaiting: vi.fn(),
  publishActivity: vi.fn(),
  forgetTitle: vi.fn(),
  noteTitleTurn: vi.fn(),
  noteWorkPhase: vi.fn(),
  maybeGenerateTitle: vi.fn(async () => {}),
  recordToolCallStart: vi.fn(async () => {}),
  recordToolCallEnd: vi.fn(async () => {}),
  publishDirConfig: vi.fn(),
  publishFileWrite: vi.fn(),
  publishPromptSubmitted: vi.fn(),
  publishQuestion: vi.fn(),
  uiPort: "34567",
};

const app = express();
app.use(express.json());
mountHookRoute(app, deps);
const call = routeCall(app);

/** A copilot hook exactly as the file we write produces one: the event in a header, the session in
 *  the body, and no `x-mt-session` (copilot's hook file is machine-global, so there is nothing
 *  per-session to bake into it). */
const postCopilot = async (hook: string, payload: Record<string, unknown>) => {
  const res = await call("/api/hook", jsonPost(payload, { "x-mt-agent": "copilot", "x-mt-hook": hook }));
  expect(res.status).toBe(200);
  return res;
};

beforeEach(() => {
  lastPrompts.delete(ID);
  vi.clearAllMocks();
});

describe("/api/hook with x-mt-agent: copilot", () => {
  it("turns agentStop into the Stop effects — finished, and flagged for attention", async () => {
    await postCopilot("agentStop", { sessionId: ID, cwd: CWD, transcriptPath: "/tmp/t.jsonl", stopReason: "end_turn" });
    expect(deps.setWorking).toHaveBeenCalledWith(ID, false, "Stop");
    expect(deps.setWaiting).toHaveBeenCalledWith(ID, true, "Stop");
  });

  it("turns userPromptSubmitted into working, and keeps the prompt for the header", async () => {
    await postCopilot("userPromptSubmitted", { sessionId: ID, cwd: CWD, prompt: "Reply with just the word pong." });
    expect(deps.setWorking).toHaveBeenCalledWith(ID, true, "UserPromptSubmit");
    expect(lastPrompts.get(ID)).toContain("pong");
  });

  it("records a tool call from copilot's own field names", async () => {
    await postCopilot("preToolUse", { sessionId: ID, cwd: CWD, toolName: "apply_patch", toolArgs: "*** Begin Patch" });
    expect(deps.recordToolCallStart).toHaveBeenCalledWith(ID, expect.objectContaining({ toolName: "apply_patch", toolInput: "*** Begin Patch" }));

    await postCopilot("postToolUse", { sessionId: ID, cwd: CWD, toolName: "apply_patch", toolArgs: "x", toolResult: "{'resultType': 'success'}" });
    expect(deps.recordToolCallEnd).toHaveBeenCalledWith(ID, expect.objectContaining({ toolName: "apply_patch", status: "completed" }));
  });

  it("does NOTHING for permissionRequest — it fires on every tool call, not only when blocked", async () => {
    await postCopilot("permissionRequest", { sessionId: ID, cwd: CWD, toolName: "edit", toolInput: "{}" });
    expect(deps.setWaiting).not.toHaveBeenCalled();
    expect(deps.setWorking).not.toHaveBeenCalled();
  });

  it("answers 200 and does nothing for an event it cannot translate, or a payload with no session", async () => {
    await postCopilot("somethingCopilotAddedLater", { sessionId: ID, cwd: CWD });
    await postCopilot("agentStop", { cwd: CWD });
    expect(deps.setWorking).not.toHaveBeenCalled();
    expect(deps.setWaiting).not.toHaveBeenCalled();
  });

  it("does not take the copilot path on a REPEATED agent header — a duplicate is not ours", async () => {
    // Node joins repeated headers with ", ", so this is what a second forged header looks like by
    // the time express hands it over. It must fall through to the claude path, where a body with no
    // `hook_event_name` is simply inert — failing closed rather than translating on a forgery.
    const res = await call("/api/hook", jsonPost({ sessionId: ID, cwd: CWD }, { "x-mt-agent": "copilot, copilot", "x-mt-hook": "agentStop" }));
    expect(res.status).toBe(200);
    expect(deps.setWorking).not.toHaveBeenCalled();
    expect(deps.setWaiting).not.toHaveBeenCalled();
  });
});

describe("the copilot branch costs an ordinary claude hook nothing", () => {
  it("still applies Stop when no copilot headers are present", async () => {
    const res = await call("/api/hook", jsonPost({ hook_event_name: "Stop", session_id: ID, cwd: CWD }, { "x-mt-session": ID }));
    expect(res.status).toBe(200);
    expect(deps.setWorking).toHaveBeenCalledWith(ID, false, "Stop");
    expect(deps.setWaiting).toHaveBeenCalledWith(ID, true, "Stop");
  });

  it("still applies UserPromptSubmit when no copilot headers are present", async () => {
    await call("/api/hook", jsonPost({ hook_event_name: "UserPromptSubmit", session_id: ID, cwd: CWD, prompt: "hello" }, { "x-mt-session": ID }));
    expect(deps.setWorking).toHaveBeenCalledWith(ID, true, "UserPromptSubmit");
    expect(lastPrompts.get(ID)).toContain("hello");
  });
});
