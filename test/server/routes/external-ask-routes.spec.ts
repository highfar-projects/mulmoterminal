// @vitest-environment node
// The external ask routes (plans/feat-external-ask.md). They type into a session the user has open,
// so most of what matters is the refusals — none of which may reach the sender — and that a send is
// tagged and recorded.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Express } from "express";
import type { AskQuestionEvent } from "../../../common/askQuestion.js";
import { mountExternalAskRoutes, type ExternalAskRouteDeps } from "../../../server/routes/external-ask-routes.js";
import { InputBlockedError, type SendOptions } from "../../../server/backends/remoteHost/terminalInput.js";
import type { ExternalReadResult } from "../../../server/session/transcript/external-ask-read.js";

const SESSION = "0b7d2c1e-1111-4222-8333-944455556666";
const CWD = "/srv/clone";
const TOKEN = "secret-token";
const ASK = "0123456789ab";

interface FakeRes {
  statusCode: number;
  payload: unknown;
  status(code: number): FakeRes;
  json(body: unknown): FakeRes;
  on(event: string, cb: () => void): FakeRes;
}
const makeRes = (): FakeRes => ({
  statusCode: 200,
  payload: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.payload = body;
    return this;
  },
  on() {
    return this;
  },
});

interface Req {
  params: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
  headers: { origin?: string };
  get(name: string): string | undefined;
}
type Handler = (req: Req, res: FakeRes) => Promise<unknown>;

const send = vi.fn<(session: string, text: string, options: SendOptions) => Promise<unknown>>();
const record = vi.fn<ExternalAskRouteDeps["record"]>(async () => {});
const openQuestion = vi.fn<(session: string) => Promise<AskQuestionEvent | null>>();
const readAnswer = vi.fn<(session: string, askId: string) => Promise<ExternalReadResult>>();
let settings = { enabled: true, allowDirs: [CWD], label: "edgar" };
let permission = false;
let working = false;
let live = [{ id: SESSION, agent: "claude", cwd: CWD }];
let exists = true;

function routes(): Record<string, Handler> {
  const map: Record<string, Handler> = {};
  const app = {
    get: (path: string, handler: Handler) => (map[`GET ${path}`] = handler),
    post: (path: string, handler: Handler) => (map[`POST ${path}`] = handler),
  } as unknown as Express;
  let clock = 0;
  mountExternalAskRoutes(app, {
    settings: async () => settings,
    token: async () => TOKEN,
    liveSessions: () => live,
    sessionExists: async () => exists,
    agentOf: (id) => live.find((s) => s.id === id)?.agent ?? null,
    describe: () => ({ memo: "estimates", title: "estimates", working, waiting: false }),
    branchOf: async () => "main",
    openQuestion,
    permissionPending: () => permission,
    send,
    readAnswer,
    record,
    nonce: () => ASK,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  return map;
}

const request = (opts: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; auth?: string | null; origin?: string }): Req => {
  const auth = opts.auth === undefined ? `Bearer ${TOKEN}` : opts.auth;
  return {
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body,
    headers: opts.origin ? { origin: opts.origin } : {},
    get: (name) => (name.toLowerCase() === "authorization" ? (auth ?? undefined) : undefined),
  };
};

const post = async (body: unknown, extra: { auth?: string | null; origin?: string } = {}): Promise<FakeRes> => {
  const res = makeRes();
  await routes()["POST /api/external/sessions/:sessionId/asks"]?.(request({ params: { sessionId: SESSION }, body, ...extra }), res);
  return res;
};

const wait = async (query: Record<string, string> = {}): Promise<FakeRes> => {
  const res = makeRes();
  await routes()["GET /api/external/sessions/:sessionId/asks/:askId"]?.(request({ params: { sessionId: SESSION, askId: ASK }, query }), res);
  return res;
};

beforeEach(() => {
  settings = { enabled: true, allowDirs: [CWD], label: "edgar" };
  permission = false;
  working = false;
  exists = true;
  live = [{ id: SESSION, agent: "claude", cwd: CWD }];
  send.mockReset();
  send.mockResolvedValue({ sent: true });
  record.mockClear();
  openQuestion.mockReset();
  openQuestion.mockResolvedValue(null);
  readAnswer.mockReset();
});

describe("POST /api/external/sessions/:sessionId/asks", () => {
  it("types the text with its tag, records it, and answers 202 with the ask id", async () => {
    const res = await post({ text: "見積もりをお願いします", expectCwd: CWD });
    expect(res.statusCode).toBe(202);
    expect(res.payload).toMatchObject({ askId: ASK, session: SESSION, sentText: `見積もりをお願いします [edgar ${ASK}]` });
    expect(send).toHaveBeenCalledWith(SESSION, `見積もりをお願いします [edgar ${ASK}]`, { blocked: expect.any(Function) });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ askId: ASK, session: SESSION, cwd: CWD, label: "edgar" }));
  });

  it.each([
    ["without the token", { auth: null }, 401, "unauthorized"],
    ["with a wrong token", { auth: "Bearer nope" }, 401, "unauthorized"],
    ["from a web page", { origin: "http://localhost:47232" }, 403, "origin-not-allowed"],
  ])("refuses a request %s", async (_label, extra, status, code) => {
    const res = await post({ text: "hi", expectCwd: CWD }, extra);
    expect(res.statusCode).toBe(status);
    expect(res.payload).toMatchObject({ error: code });
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses everything while the feature is off", async () => {
    settings = { ...settings, enabled: false };
    const res = await post({ text: "hi", expectCwd: CWD });
    expect(res.payload).toMatchObject({ error: "disabled" });
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a directory outside allowDirs", async () => {
    settings = { ...settings, allowDirs: ["/srv/other"] };
    const res = await post({ text: "hi", expectCwd: CWD });
    expect(res.payload).toMatchObject({ error: "target-not-allowed" });
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses when the session is no longer in the directory the caller expects", async () => {
    const res = await post({ text: "hi", expectCwd: "/srv/elsewhere" });
    expect(res.statusCode).toBe(409);
    expect(res.payload).toMatchObject({ error: "target-changed" });
  });

  it("404s a session with no live terminal here", async () => {
    live = [];
    expect((await post({ text: "hi", expectCwd: CWD })).payload).toMatchObject({ error: "no-session" });
  });

  it("refuses a shell, whose answer could never be read", async () => {
    live = [{ id: SESSION, agent: "shell", cwd: CWD }];
    expect((await post({ text: "hi", expectCwd: CWD })).payload).toMatchObject({ error: "unsupported-agent" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["a permission prompt", () => (permission = true), "permission-pending"],
    ["a question dialog", () => openQuestion.mockResolvedValue({ sessionId: SESSION, toolUseId: "t", questions: [] }), "question-open"],
    ["a turn running", () => (working = true), "busy"],
  ])("sends nothing while the session has %s", async (_label, arrange, code) => {
    arrange();
    const res = await post({ text: "hi", expectCwd: CWD });
    expect(res.statusCode).toBe(409);
    expect(res.payload).toMatchObject({ error: code });
    expect(send).not.toHaveBeenCalled();
  });

  it("hands the sender a check that also sees a permission prompt", async () => {
    await post({ text: "hi", expectCwd: CWD });
    const blocked = send.mock.calls[0]?.[2].blocked;
    expect(await blocked?.()).toBe(false);
    permission = true;
    expect(await blocked?.()).toBe(true);
  });

  it("says the text is in the input box when a dialog opened after the paste", async () => {
    send.mockRejectedValue(new InputBlockedError("blocked", true));
    const res = await post({ text: "hi", expectCwd: CWD });
    expect(res.statusCode).toBe(409);
    expect(res.payload).toMatchObject({ error: "typed-not-submitted", askId: ASK });
    expect(record).toHaveBeenCalled();
  });
});

describe("GET /api/external/sessions/:sessionId/asks/:askId", () => {
  it("answers once the turn has ended", async () => {
    readAnswer.mockResolvedValueOnce({ status: "pending", seen: true }).mockResolvedValueOnce({ status: "answered", reply: "3 days" });
    const res = await wait({ waitSeconds: "30" });
    expect(res.payload).toEqual({ status: "answered", reply: "3 days" });
    expect(readAnswer).toHaveBeenCalledTimes(2);
  });

  it("says pending when the wait runs out", async () => {
    readAnswer.mockResolvedValue({ status: "pending", seen: true });
    working = true;
    const res = await wait({ waitSeconds: "6" });
    expect(res.payload).toEqual({ status: "pending", seen: true, working: true });
  });

  it("410s a session that ended without answering", async () => {
    readAnswer.mockResolvedValue({ status: "pending", seen: true });
    exists = false;
    const res = await wait({ waitSeconds: "0" });
    expect(res.statusCode).toBe(410);
    expect(res.payload).toMatchObject({ error: "session-ended" });
  });

  it("404s a session this host has never heard of", async () => {
    live = [];
    exists = false;
    expect((await wait()).payload).toMatchObject({ error: "no-session" });
    expect(readAnswer).not.toHaveBeenCalled();
  });

  it("410s a cleared conversation", async () => {
    readAnswer.mockResolvedValue({ status: "cleared" });
    expect((await wait()).payload).toMatchObject({ error: "conversation-cleared" });
  });

  it("refuses without the token", async () => {
    const res = makeRes();
    await routes()["GET /api/external/sessions/:sessionId/asks/:askId"]?.(request({ params: { sessionId: SESSION, askId: ASK }, auth: null }), res);
    expect(res.statusCode).toBe(401);
    expect(readAnswer).not.toHaveBeenCalled();
  });
});

describe("GET /api/external/sessions", () => {
  it("lists the live sessions with what a caller needs to choose one", async () => {
    const res = makeRes();
    await routes()["GET /api/external/sessions"]?.(request({}), res);
    expect(res.payload).toEqual({
      sessions: [
        {
          id: SESSION,
          agent: "claude",
          cwd: CWD,
          branch: "main",
          memo: "estimates",
          title: "estimates",
          working: false,
          waiting: false,
          questionOpen: false,
          permissionPending: false,
          allowed: true,
          replyReadable: true,
        },
      ],
    });
  });
});
