// @vitest-environment node
// What the phone is TOLD, pinned at the route the hook posts to.
//
// The pieces have their own specs — buildPushDetail decides the tiers, buildPushText the wording —
// but the seam where the user-visible bug lived (#1696) is here: the route held the answer in its
// hands (`last_assistant_message`) and threw it away, then rebuilt it from a transcript it could
// not always read, and printed the user's own prompt whenever that failed.
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { mountHookRoute } from "../../../server/routes/hook-routes";
import { aiTitles, lastPrompts, lastResponses, ptys } from "../../../server/session/registry";
import { clearedTranscripts } from "../../../server/session/cleared-transcripts";

const pushes: Array<{ title: string; body: string }> = [];
vi.mock("../../../server/infra/web-push.js", () => ({
  sendWebPush: async (title: string, body: string) => {
    pushes.push({ title, body });
    return null;
  },
}));

// The user's real config decides whether a push is sent at all; these tests are about what it
// says, so both switches are held on.
vi.mock("../../../server/config/config-routes.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/config/config-routes")>()),
  getPushEnabled: () => true,
  getPushKinds: () => ["finished", "waiting"],
}));

// No transcript on disk — which is the case the hook payload now answers on its own, and the case
// that used to fall through to the prompt.
vi.mock("../../../server/session/session-reads.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/session/session-reads")>()),
  claudeCurrentTurnReply: async () => null,
  latestUserPrompt: async () => null,
}));

const ID = "11111111-2222-4333-8444-555555555555";
const PROMPT = "通知の本文がおかしいので直して";

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

const postHook = (body: Record<string, unknown>) => request(app).post("/api/hook").set("x-mt-session", ID).send(body);

// The push is fire-and-forget, so the route answers before it is sent.
const nextPush = async (): Promise<{ title: string; body: string }> => {
  await vi.waitFor(() => expect(pushes).toHaveLength(1));
  const sent = pushes[0];
  if (!sent) throw new Error("no push was sent");
  return sent;
};

beforeEach(() => {
  pushes.length = 0;
  lastPrompts.set(ID, PROMPT);
  aiTitles.delete(ID);
  lastResponses.delete(ID);
  clearedTranscripts.delete(ID);
  ptys.set(ID, { term: { kill: () => undefined }, ws: null, buffer: "", cwd: "/work/mulmoterminal", active: false, agent: "claude" } as never);
});

describe("a finished turn", () => {
  it("says what the turn ended with, taken from the Stop payload", async () => {
    await postHook({ hook_event_name: "Stop", last_assistant_message: "直しました。テストも足しています。" });

    expect((await nextPush()).body).toBe("直しました。テストも足しています。");
    // The roster shows the same text, so the cell and the phone cannot disagree about the turn.
    expect(lastResponses.get(ID)).toBe("直しました。テストも足しています。");
  });

  // A turn the user interrupted has no reply anywhere — not in the payload, not in the transcript.
  it("says nothing about the outcome rather than reading the prompt back", async () => {
    await postHook({ hook_event_name: "Stop" });

    const { body } = await nextPush();
    expect(body).not.toContain(PROMPT);
    expect(body).toBe("タスクが完了しました");
  });

  it("names the session instead, when it has a title", async () => {
    aiTitles.set(ID, "push 通知の調査");

    await postHook({ hook_event_name: "Stop" });

    expect((await nextPush()).body).toBe("push 通知の調査");
  });

  // `/clear` freezes our copy of the transcript, and the mark lifts only when THAT file grows —
  // which it never does, because claude has moved to another one. So every later turn of a cleared
  // session used to reach the phone as the user's own prompt. The payload is not that file.
  it("still reports the reply after a /clear froze the transcript", async () => {
    clearedTranscripts.add(ID);

    await postHook({ hook_event_name: "Stop", last_assistant_message: "clear のあとの返事です" });

    expect((await nextPush()).body).toBe("clear のあとの返事です");
  });
});

describe("a blocked turn", () => {
  it("says what the agent is asking for", async () => {
    await postHook({ hook_event_name: "Notification", message: "Claude needs your permission", notification_type: "permission_prompt" });

    expect((await nextPush()).body).toBe("Claude needs your permission");
  });

  it("falls back to the fixed wording, never to the prompt, when the hook carries no message", async () => {
    await postHook({ hook_event_name: "Notification", notification_type: "permission_prompt" });

    const { body } = await nextPush();
    expect(body).not.toContain(PROMPT);
    expect(body).toBe("入力待ちです");
  });
});
