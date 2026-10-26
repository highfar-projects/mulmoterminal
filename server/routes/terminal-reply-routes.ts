// The board's view of a cell and its reply box (#3185): the cell's screen as plain text, and one
// line typed into it with Enter. The same capture and the same sender the phone's remote view uses,
// so no second judgement about which bytes reach a terminal is made here.
//
// POST is a write into a live terminal, so it keeps a same-origin check of its own on top of the
// central gate, as the other routes that start or drive a process do.
import type { Express } from "express";
import type { AskQuestionEvent } from "../../common/askQuestion.js";
import { SESSION_ID_RE } from "../config/env.js";
import { readReplyRequest } from "./terminalReply.js";
import { requestOriginAllowed } from "./same-origin-guard.js";

export interface TerminalReplyRouteDeps {
  /** Exact: tmux resolves a target by prefix, so this must not ask tmux by name. */
  sessionExists: (sessionId: string) => Promise<boolean>;
  captureScreen: (sessionId: string) => Promise<{ screen: string }>;
  /** The question dialog the session is blocked on, from the tool-call history the hooks record
   *  whether or not the question pane is on. */
  openQuestion: (sessionId: string) => Promise<AskQuestionEvent | null>;
  /** Resolves once the Enter has gone out; rejects when the session has no live terminal here. */
  sendReply: (sessionId: string, text: string) => Promise<unknown>;
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
  isAllowedHost: (hostHeader: string | undefined) => boolean;
}

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

export function mountTerminalReplyRoutes(app: Express, deps: TerminalReplyRouteDeps): void {
  // A GET is answered to any origin's page that can reach it, and a DNS-rebound page reaches it as
  // same-origin with no Origin header; its Host is still the attacker's name, so that is what is
  // checked before a terminal's screen is handed over.
  app.get("/api/terminal/:sessionId/screen", async (req, res) => {
    if (!deps.isAllowedHost(req.headers.host)) return res.status(403).json({ error: "forbidden host" });
    const { sessionId } = req.params;
    if (!SESSION_ID_RE.test(sessionId)) return res.status(400).json({ error: "invalid sessionId" });
    if (!(await deps.sessionExists(sessionId))) return res.status(HTTP_NOT_FOUND).json({ error: "no such session on this host" });
    try {
      const { screen } = await deps.captureScreen(sessionId);
      res.json({ screen });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/terminal/:sessionId/reply", async (req, res) => {
    if (!requestOriginAllowed(req, deps.isAllowedOrigin)) return res.status(403).end();
    const request = readReplyRequest(req.params.sessionId, req.body);
    if (!request.ok) return res.status(request.status).json({ error: request.error });
    // Checked HERE, at the moment of writing, rather than trusted from the browser: a dialog can
    // open after the page last asked, and the line would then be typed into it.
    if (await deps.openQuestion(request.sessionId)) {
      return res.status(HTTP_CONFLICT).json({ error: "a question is open in this terminal — answer it first", reason: "question-open" });
    }
    try {
      await deps.sendReply(request.sessionId, request.text);
      res.json({ ok: true });
    } catch (err) {
      res.status(HTTP_CONFLICT).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
