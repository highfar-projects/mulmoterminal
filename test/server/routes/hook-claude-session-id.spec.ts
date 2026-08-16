// @vitest-environment node
// That the hook route REMEMBERS claude's own session id, pinned at the route.
//
// The rule and its consequences have their own specs (claudeOwnSessionId, historyIdsFor), and this
// is the seam between them: claude reissues its id on `/clear` and `/compact` while still reporting
// to us under ours, so anything keyed by CLAUDE's id — its prompt-history file — reads the wrong
// session from that moment unless the route captures the new one (Codex, #1749). Nothing else
// observes the mapping, so a missing `claudeSessionIds.set` would be invisible in every other spec.
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { mountHookRoute } from "../../../server/routes/hook-routes";
import { claudeSessionIds } from "../../../server/session/registry";

vi.mock("../../../server/session/session-reads.js", () => ({ latestUserPrompt: vi.fn(async () => null) }));
vi.mock("../../../server/session/cleared-transcripts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../server/session/cleared-transcripts")>();
  return { ...actual, markTranscriptCleared: async () => {} };
});

const OURS = "11111111-2222-4333-8444-555555555555";
const REISSUED = "99999999-8888-4777-8666-555555555555";

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
  publishQuestion: vi.fn(),
  uiPort: "34567",
};

const app = express();
app.use(express.json());
mountHookRoute(app, deps);

const postHook = (body: Record<string, unknown>) => request(app).post("/api/hook").set("x-mt-session", OURS).send(body);

beforeEach(() => {
  claudeSessionIds.delete(OURS);
  vi.clearAllMocks();
});

describe("the hook route remembers claude's own session id", () => {
  it("records the id claude reports for itself, under ours", async () => {
    await postHook({ hook_event_name: "UserPromptSubmit", session_id: REISSUED, prompt: "go" });
    expect(claudeSessionIds.get(OURS)).toBe(REISSUED);
  });

  // Any hook, not just a prompt: the mapping is in memory, so after a restart the first tool call
  // of an already-running session is the earliest chance to re-learn it.
  it("records it from a tool hook too", async () => {
    await postHook({ hook_event_name: "PreToolUse", session_id: REISSUED, tool_name: "Bash", tool_input: { command: "ls" } });
    expect(claudeSessionIds.get(OURS)).toBe(REISSUED);
  });

  it("keeps the newest one when claude reissues again", async () => {
    await postHook({ hook_event_name: "Stop", session_id: OURS });
    expect(claudeSessionIds.get(OURS)).toBe(OURS);
    await postHook({ hook_event_name: "Stop", session_id: REISSUED });
    expect(claudeSessionIds.get(OURS)).toBe(REISSUED);
  });

  it("records nothing for a body that names no usable id", async () => {
    await postHook({ hook_event_name: "Stop" });
    expect(claudeSessionIds.has(OURS)).toBe(false);
    await postHook({ hook_event_name: "Stop", session_id: "../etc/passwd" });
    expect(claudeSessionIds.has(OURS)).toBe(false);
    await postHook({ hook_event_name: "Stop", session_id: 42 });
    expect(claudeSessionIds.has(OURS)).toBe(false);
  });
});
