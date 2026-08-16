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
const THIRD = "22222222-3333-4444-8555-666666666666";

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

describe("the hook route remembers claude's own session ids", () => {
  it("records the id claude reports for itself, under ours", async () => {
    await postHook({ hook_event_name: "UserPromptSubmit", session_id: REISSUED, prompt: "go" });
    expect(claudeSessionIds.get(OURS)).toEqual([REISSUED]);
  });

  // Any hook, not just a prompt: the chain is in memory, so after a restart the first tool call of
  // an already-running session is the earliest chance to re-learn it.
  it("records it from a tool hook too", async () => {
    await postHook({ hook_event_name: "PreToolUse", session_id: REISSUED, tool_name: "Bash", tool_input: { command: "ls" } });
    expect(claudeSessionIds.get(OURS)).toEqual([REISSUED]);
  });

  // Codex, #1749: a long session auto-compacts more than once, and the prompts of each stretch are
  // filed under the id it ran as. Keeping only the newest loses everything before the last compact.
  it("KEEPS the chain when claude reissues again, rather than replacing it", async () => {
    await postHook({ hook_event_name: "Stop", session_id: OURS });
    await postHook({ hook_event_name: "Stop", session_id: REISSUED });
    await postHook({ hook_event_name: "Stop", session_id: THIRD });
    expect(claudeSessionIds.get(OURS)).toEqual([OURS, REISSUED, THIRD]);
  });

  it("does not repeat an id — every hook of a turn carries the same one", async () => {
    await postHook({ hook_event_name: "Stop", session_id: REISSUED });
    await postHook({ hook_event_name: "PreToolUse", session_id: REISSUED, tool_name: "Read" });
    expect(claudeSessionIds.get(OURS)).toEqual([REISSUED]);
  });

  // The chain belongs to the conversation. `/clear` ends it, and the id this very hook carries is
  // the NEW conversation's — so the reset has to happen before the id is recorded, not after.
  it("empties the chain on /clear and starts it again from the new id", async () => {
    await postHook({ hook_event_name: "Stop", session_id: OURS });
    await postHook({ hook_event_name: "SessionStart", source: "clear", session_id: REISSUED });
    expect(claudeSessionIds.get(OURS)).toEqual([REISSUED]);
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
