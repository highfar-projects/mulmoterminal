// HTTP routes for bot tokens (plans/feat-bot-gpu-jobs.md). The app-wide same-origin guard covers the
// POST and DELETE; the GET lists ids and names only, never a secret.
//
//   GET    /api/bot-tokens            → { tokens: BotTokenRecord[], endpoints }
//   POST   /api/bot-tokens  { name? } → { token, record, endpoints } — the secret, this once
//   DELETE /api/bot-tokens/:tokenId   → { ok: true }
import type { Express, Request, Response } from "express";
import { isRecord } from "../../../common/isRecord.js";
import { BOT_ENDPOINTS, createBotToken, readBotTokens, revokeBotToken, type BotTokenDeps } from "./botTokens.js";

const MAX_NAME_LENGTH = 64;
const TOKEN_ID = /^[0-9a-f]{64}$/u;
const DEFAULT_NAME = "bot";

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const nameOf = (body: unknown): string | null => {
  const raw = isRecord(body) ? body.name : undefined;
  if (raw === undefined) return DEFAULT_NAME;
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
};

export function mountBotTokenRoutes(app: Express, deps: BotTokenDeps): void {
  app.get("/api/bot-tokens", async (_req: Request, res: Response) => {
    res.json({ tokens: await readBotTokens(deps.file), endpoints: BOT_ENDPOINTS });
  });

  app.post("/api/bot-tokens", async (req: Request, res: Response) => {
    const name = nameOf(req.body);
    if (name === null) {
      res.status(400).json({ error: `name must be a non-empty string of at most ${MAX_NAME_LENGTH} characters` });
      return;
    }
    try {
      // The secret is in this response and nowhere else: not logged, not stored.
      res.set("Cache-Control", "no-store").json(await createBotToken(deps, name));
    } catch (err) {
      res.status(502).json({ error: messageOf(err) });
    }
  });

  app.delete("/api/bot-tokens/:tokenId", async (req: Request, res: Response) => {
    const { tokenId } = req.params;
    if (typeof tokenId !== "string" || !TOKEN_ID.test(tokenId)) {
      res.status(400).json({ error: "tokenId is invalid" });
      return;
    }
    try {
      await revokeBotToken(deps, tokenId);
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: messageOf(err) });
    }
  });
}
