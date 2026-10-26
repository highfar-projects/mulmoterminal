// @vitest-environment node
//
// Bot tokens (plans/feat-bot-gpu-jobs.md): minted for THIS host through mulmoserver's createBotToken
// callable, kept here as id + name only, revoked through revokeBotToken. The secret must reach the
// caller once and never the file.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { routeCall, jsonPost } from "../../../helpers/routeCall.js";
import { mountBotTokenRoutes } from "../../../../server/backends/botJobs/routes.js";
import { BOT_ENDPOINTS, type BotTokenDeps } from "../../../../server/backends/botJobs/botTokens.js";

const SECRET = `mtb_${"a".repeat(43)}`;
const TOKEN_ID = "b".repeat(64);
const NOW = new Date("2026-10-26T00:00:00Z");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bot-tokens-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

interface Sent {
  url: string;
  auth: string | null;
  body: unknown;
}

const setup = (
  over: Partial<BotTokenDeps> = {},
  reply: (url: string) => { status: number; body: unknown } = () => ({ status: 200, body: { result: { ok: true } } }),
) => {
  const sent: Sent[] = [];
  const file = path.join(dir, "bot-tokens.json");
  const deps: BotTokenDeps = {
    file,
    idToken: async () => "id-token",
    hostId: () => "mulmoterminal-0a1b2c3d",
    now: () => NOW,
    fetch: async (input, init) => {
      const url = String(input);
      sent.push({ url, auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
      const { status, body } = reply(url);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
    ...over,
  };
  const app = express();
  app.use(express.json());
  mountBotTokenRoutes(app, deps);
  return { call: routeCall(app), sent, file };
};

const minting = (url: string) =>
  url.endsWith("/createBotToken") ? { status: 200, body: { result: { token: SECRET, tokenId: TOKEN_ID } } } : { status: 200, body: { result: { ok: true } } };

describe("bot token routes", () => {
  it("mints for this host as the signed-in user, answers the secret once, and keeps only the record", async () => {
    const { call, sent, file } = setup({}, minting);
    const res = await call("/api/bot-tokens", jsonPost({ name: " GrokBot " }));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({
      token: SECRET,
      record: { tokenId: TOKEN_ID, name: "GrokBot", hostId: "mulmoterminal-0a1b2c3d", createdAt: NOW.toISOString() },
      endpoints: BOT_ENDPOINTS,
    });
    expect(sent).toEqual([
      {
        url: "https://asia-northeast1-mulmoserver.cloudfunctions.net/createBotToken",
        auth: "Bearer id-token",
        body: { data: { hostId: "mulmoterminal-0a1b2c3d", name: "GrokBot" } },
      },
    ]);
    const kept = readFileSync(file, "utf8");
    expect(kept).not.toContain(SECRET);
    expect((await call("/api/bot-tokens")).body).toEqual({ tokens: [res.body.record], endpoints: BOT_ENDPOINTS });
  });

  it("refuses to mint while the mobile remote is not connected", async () => {
    const { call, sent } = setup({ idToken: async () => null, hostId: () => null });
    const res = await call("/api/bot-tokens", jsonPost({ name: "GrokBot" }));
    expect(res.status).toBe(502);
    expect(String(res.body.error)).toMatch(/Connect MulmoTerminal/);
    expect(sent).toEqual([]);
  });

  it("refuses a bad name without calling out", async () => {
    const { call, sent } = setup();
    expect((await call("/api/bot-tokens", jsonPost({ name: "" }))).status).toBe(400);
    expect((await call("/api/bot-tokens", jsonPost({ name: "x".repeat(65) }))).status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("passes mulmoserver's refusal through", async () => {
    const { call } = setup({}, () => ({ status: 404, body: { error: { message: "no such host", status: "NOT_FOUND" } } }));
    const res = await call("/api/bot-tokens", jsonPost({}));
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("createBotToken failed: no such host");
  });

  it("revokes at mulmoserver first, then forgets the record", async () => {
    const { call, sent } = setup({}, minting);
    await call("/api/bot-tokens", jsonPost({ name: "GrokBot" }));
    const res = await call(`/api/bot-tokens/${TOKEN_ID}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(sent[1]).toMatchObject({ url: "https://asia-northeast1-mulmoserver.cloudfunctions.net/revokeBotToken", body: { data: { tokenId: TOKEN_ID } } });
    expect((await call("/api/bot-tokens")).body.tokens).toEqual([]);
  });

  it("keeps the record when mulmoserver did not revoke it, so it can still be revoked", async () => {
    const { call } = setup({}, (url) => (url.endsWith("/revokeBotToken") ? { status: 500, body: { error: { message: "INTERNAL" } } } : minting(url)));
    await call("/api/bot-tokens", jsonPost({ name: "GrokBot" }));
    expect((await call(`/api/bot-tokens/${TOKEN_ID}`, { method: "DELETE" })).status).toBe(502);
    expect((await call("/api/bot-tokens")).body.tokens).toHaveLength(1);
  });

  it("refuses a malformed token id", async () => {
    const { call, sent } = setup();
    expect((await call("/api/bot-tokens/not-an-id", { method: "DELETE" })).status).toBe(400);
    expect(sent).toEqual([]);
  });
});
