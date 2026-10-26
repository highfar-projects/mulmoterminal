// @vitest-environment node
// The board's screen + reply routes (#3185). The reply is a write into a live terminal, so the cases
// that matter are the refusals: a foreign origin, a malformed session id, text with nothing to type,
// and a session with no live terminal here — none of which may reach the sender.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Express } from "express";
import { mountTerminalReplyRoutes } from "../../../server/routes/terminal-reply-routes.js";
import { readReplyRequest, REPLY_MAX_CHARS } from "../../../server/routes/terminalReply.js";

const SESSION = "0b7d2c1e-1111-4222-8333-944455556666";

interface FakeRes {
  statusCode: number;
  payload: unknown;
  status(code: number): FakeRes;
  json(body: unknown): FakeRes;
  end(): FakeRes;
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
  end() {
    return this;
  },
});

type Req = { method: string; path: string; params: { sessionId: string }; body?: unknown; headers: { origin?: string }; socket: { remoteAddress: string } };
type Handler = (req: Req, res: FakeRes) => Promise<unknown>;

const sessionExists = vi.fn<(sessionId: string) => Promise<boolean>>(async () => true);
const captureScreen = vi.fn<(sessionId: string) => Promise<{ screen: string }>>(async () => ({ screen: "Do you want to continue?\n> " }));
const sendReply = vi.fn<(sessionId: string, text: string) => Promise<{ sent: boolean }>>(async () => ({ sent: true }));

function routes(allowOrigin = true): { get: Handler; post: Handler } {
  const map: Record<string, Handler> = {};
  const app = {
    get: (path: string, handler: Handler) => (map[`GET ${path}`] = handler),
    post: (path: string, handler: Handler) => (map[`POST ${path}`] = handler),
  } as unknown as Express;
  mountTerminalReplyRoutes(app, { sessionExists, captureScreen, sendReply, isAllowedOrigin: () => allowOrigin });
  const get = map["GET /api/terminal/:sessionId/screen"];
  const post = map["POST /api/terminal/:sessionId/reply"];
  if (!get || !post) throw new Error("routes not mounted");
  return { get, post };
}

const request = (sessionId: string, body?: unknown): Req => ({
  method: body === undefined ? "GET" : "POST",
  path: `/api/terminal/${sessionId}/${body === undefined ? "screen" : "reply"}`,
  params: { sessionId },
  body,
  headers: { origin: "http://localhost:34567" },
  socket: { remoteAddress: "127.0.0.1" },
});

beforeEach(() => {
  sessionExists.mockReset();
  sessionExists.mockResolvedValue(true);
  captureScreen.mockClear();
  sendReply.mockReset();
  sendReply.mockResolvedValue({ sent: true });
});

describe("GET /api/terminal/:sessionId/screen", () => {
  it("answers the captured screen as plain text", async () => {
    const res = makeRes();
    await routes().get(request(SESSION), res);
    expect(res.payload).toEqual({ screen: "Do you want to continue?\n> " });
    expect(captureScreen).toHaveBeenCalledWith(SESSION);
  });

  it("404s a session this host does not hold, without capturing", async () => {
    sessionExists.mockResolvedValue(false);
    const res = makeRes();
    await routes().get(request(SESSION), res);
    expect(res.statusCode).toBe(404);
    expect(captureScreen).not.toHaveBeenCalled();
  });

  it.each(["", "mt-abc", `${SESSION}x`, "../../etc"])("refuses the session id %j without capturing", async (sessionId) => {
    const res = makeRes();
    await routes().get(request(sessionId), res);
    expect(res.statusCode).toBe(400);
    expect(captureScreen).not.toHaveBeenCalled();
  });
});

describe("POST /api/terminal/:sessionId/reply", () => {
  it("types the text into the session", async () => {
    const res = makeRes();
    await routes().post(request(SESSION, { text: "yes, go ahead" }), res);
    expect(res.payload).toEqual({ ok: true });
    expect(sendReply).toHaveBeenCalledWith(SESSION, "yes, go ahead");
  });

  it("403s a foreign origin before reading anything", async () => {
    const res = makeRes();
    await routes(false).post(request(SESSION, { text: "rm -rf" }), res);
    expect(res.statusCode).toBe(403);
    expect(sendReply).not.toHaveBeenCalled();
  });

  it("409s when the session has no live terminal here, with the sender's reason", async () => {
    sendReply.mockRejectedValue(new Error(`session ${SESSION} has no live terminal on this host`));
    const res = makeRes();
    await routes().post(request(SESSION, { text: "hi" }), res);
    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual({ error: `session ${SESSION} has no live terminal on this host` });
  });

  it.each<[string, unknown, number]>([
    ["a malformed session id", { text: "hi" }, 400],
    ["no body", undefined, 400],
  ])("refuses %s without typing", async (_case, body, status) => {
    const res = makeRes();
    await routes().post({ ...request(body === undefined ? SESSION : "nope", body), method: "POST" }, res);
    expect(res.statusCode).toBe(status);
    expect(sendReply).not.toHaveBeenCalled();
  });
});

describe("readReplyRequest", () => {
  it("passes a line through as written; the sender is what sanitizes it", () => {
    expect(readReplyRequest(SESSION, { text: "fix the test\u0003" })).toEqual({ ok: true, sessionId: SESSION, text: "fix the test\u0003" });
  });

  it.each<[string, unknown]>([
    ["no text", {}],
    ["a non-string text", { text: 5 }],
    ["an array body", ["hi"]],
    ["a null body", null],
  ])("refuses %s as a 400", (_case, body) => {
    expect(readReplyRequest(SESSION, body)).toMatchObject({ ok: false, status: 400 });
  });

  it.each(["", "   ", "\u0003", "\u001b\r\n\u0007"])("refuses %j, which has nothing printable to type", (text) => {
    expect(readReplyRequest(SESSION, { text })).toMatchObject({ ok: false, status: 400, error: "text has nothing to type" });
  });

  it("takes text up to the limit and refuses one character more as a 413", () => {
    expect(readReplyRequest(SESSION, { text: "a".repeat(REPLY_MAX_CHARS) }).ok).toBe(true);
    expect(readReplyRequest(SESSION, { text: "a".repeat(REPLY_MAX_CHARS + 1) })).toMatchObject({ ok: false, status: 413 });
  });

  it.each(["", "mt-abc", "0B7D2C1E-1111-4222-8333-94445555666"])("refuses the session id %j", (sessionId) => {
    expect(readReplyRequest(sessionId, { text: "hi" })).toMatchObject({ ok: false, status: 400, error: "invalid sessionId" });
  });
});
