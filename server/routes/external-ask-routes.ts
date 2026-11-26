// A local program sending a request to a session the user has open, and reading its answer
// (plans/feat-external-ask.md). Three routes:
//
//   GET  /api/external/sessions                          — who could be addressed
//   POST /api/external/sessions/:sessionId/asks          — type a request into one, with a tag
//   GET  /api/external/sessions/:sessionId/asks/:askId   — wait for the turn that tag started to end
//
// FORK-ONLY, and off until ~/.mulmoterminal/external-ask.json says otherwise.
//
// The guards, in order: a bearer token from ~/.mulmoterminal/external-ask-token (a page in a browser
// cannot read it), no Origin header at all (a browser always sends one on these, so no page can use
// them however it got the token), the feature switched on, and a target directory the settings allow.
// The app-wide Host and same-origin gates still run first (request-gates.ts).
import type { Express, Request, Response } from "express";
import type { AskQuestionEvent } from "../../common/askQuestion.js";
import { isTerminalAgent, type TerminalAgent } from "../../common/sessionAgent.js";
import { SESSION_ID_RE } from "../config/env.js";
import { InputBlockedError, type SendOptions } from "../backends/remoteHost/terminalInput.js";
import { messageOf } from "../errors.js";
import {
  ASK_ID_RE,
  dirAllowed,
  externalAskTag,
  parseAskRequest,
  sameDir,
  STATUS_OF,
  tokenMatches,
  waitMsOf,
  type ErrorCode,
  type ExternalAskSettings,
} from "./externalAsk.js";
import type { ExternalReadResult } from "../session/transcript/external-ask-read.js";

export interface ExternalAskSession {
  id: string;
  agent: string;
  cwd: string;
}

export interface ExternalAskRouteDeps {
  settings: () => Promise<ExternalAskSettings>;
  token: () => Promise<string>;
  /** Sessions with a live terminal in this process — the ones a send can reach. */
  liveSessions: () => ExternalAskSession[];
  /** The session is still running here or in tmux. */
  sessionExists: (session: string) => Promise<boolean>;
  agentOf: (session: string) => string | null;
  describe: (session: string) => { memo: string | null; title: string; working: boolean; waiting: boolean };
  branchOf: (cwd: string) => Promise<string | null>;
  /** What the other Claude Code sessions on this machine call it — the name on the cell's chip — or
   *  null when it is not a claude or none answers to it. A label to choose by, not an address. */
  peerNameOf: (session: string, agent: string) => Promise<string | null>;
  openQuestion: (session: string) => Promise<AskQuestionEvent | null>;
  permissionPending: (session: string) => boolean;
  /** Resolves once the Enter has gone out; rejects with InputBlockedError when `blocked` says no. */
  send: (session: string, text: string, options: SendOptions) => Promise<unknown>;
  readAnswer: (session: string, askId: string, agent: TerminalAgent) => Promise<ExternalReadResult>;
  record: (entry: { at: string; label: string; askId: string; session: string; cwd: string; chars: number }) => Promise<void>;
  nonce: () => string;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const EXTERNAL_POLL_MS = 3000;

function fail(res: Response, code: ErrorCode, message: string): void {
  res.status(STATUS_OF[code]).json({ error: code, message });
}

/** The settings once every guard has passed, or null once the refusal has been sent. */
async function admitted(req: Request, res: Response, deps: ExternalAskRouteDeps): Promise<ExternalAskSettings | null> {
  if (req.headers.origin !== undefined) {
    fail(res, "origin-not-allowed", "These routes are for local programs, not web pages: a request carrying an Origin header is refused.");
    return null;
  }
  const settings = await deps.settings();
  if (!settings.enabled) {
    fail(res, "disabled", 'External asks are off. Set "enabled": true in ~/.mulmoterminal/external-ask.json.');
    return null;
  }
  if (!tokenMatches(req.get("authorization"), await deps.token())) {
    fail(res, "unauthorized", "Send the token in ~/.mulmoterminal/external-ask-token as `Authorization: Bearer <token>`.");
    return null;
  }
  return settings;
}

/** An agent whose answers this server can read from its log. */
const readableAgent = (agent: string | null | undefined): agent is TerminalAgent => !!agent && isTerminalAgent(agent) && agent !== "muse";

function mountList(app: Express, deps: ExternalAskRouteDeps): void {
  app.get("/api/external/sessions", async (req, res) => {
    const settings = await admitted(req, res, deps);
    if (settings === null) return;
    const sessions = await Promise.all(
      deps.liveSessions().map(async ({ id, agent, cwd }) => {
        const [branch, question, peerName] = await Promise.all([
          deps.branchOf(cwd).catch(() => null),
          deps.openQuestion(id).catch(() => null),
          deps.peerNameOf(id, agent).catch(() => null),
        ]);
        return {
          id,
          agent,
          cwd,
          branch,
          peerName,
          ...deps.describe(id),
          questionOpen: question !== null,
          permissionPending: deps.permissionPending(id),
          allowed: dirAllowed(cwd, settings.allowDirs),
          replyReadable: readableAgent(agent),
        };
      }),
    );
    res.json({ sessions });
  });
}

/** Why the session cannot take a request right now, or null when it can. */
async function holdOf(deps: ExternalAskRouteDeps, session: string): Promise<ErrorCode | null> {
  if (deps.permissionPending(session)) return "permission-pending";
  if ((await deps.openQuestion(session)) !== null) return "question-open";
  return null;
}

const HOLD_MESSAGE: Partial<Record<ErrorCode, string>> = {
  "permission-pending": "The session is waiting on a permission prompt; nothing was sent.",
  "question-open": "A question dialog is open in the session; nothing was sent.",
};

function mountSend(app: Express, deps: ExternalAskRouteDeps): void {
  app.post("/api/external/sessions/:sessionId/asks", async (req, res) => {
    const settings = await admitted(req, res, deps);
    if (settings === null) return;
    const { sessionId } = req.params;
    if (!SESSION_ID_RE.test(sessionId)) return fail(res, "invalid-request", "invalid sessionId");
    const request = parseAskRequest(req.body);
    if (!request.ok) return fail(res, request.code, request.message);
    const live = deps.liveSessions().find((s) => s.id === sessionId);
    if (live === undefined) return fail(res, "no-session", `Session ${sessionId} has no live terminal in this MulmoTerminal.`);
    if (!sameDir(live.cwd, request.expectCwd))
      return fail(res, "target-changed", `Session ${sessionId} is in ${live.cwd}, not ${request.expectCwd}. Read the list again.`);
    if (!dirAllowed(live.cwd, settings.allowDirs)) return fail(res, "target-not-allowed", `${live.cwd} is not in allowDirs.`);
    if (!readableAgent(live.agent)) return fail(res, "unsupported-agent", `Replies from a ${live.agent} session cannot be read, so nothing was sent.`);
    const hold = await holdOf(deps, sessionId);
    if (hold !== null) return fail(res, hold, HOLD_MESSAGE[hold] ?? hold);
    // Typed while a turn runs, the line is queued into it and the answer has no turn of its own.
    if (deps.describe(sessionId).working) return fail(res, "busy", "The session is working on a turn; send again once it is idle.");

    const askId = deps.nonce();
    const sent = `${request.text}${externalAskTag(settings.label, askId)}`;
    // Asked again inside the sender's chain, before the paste and before the Enter.
    const blocked = async (): Promise<boolean> => (await holdOf(deps, sessionId)) !== null;
    try {
      await deps.send(sessionId, sent, { blocked });
    } catch (err) {
      if (err instanceof InputBlockedError) {
        if (err.afterPaste) {
          await deps.record({ at: new Date(deps.now()).toISOString(), label: settings.label, askId, session: sessionId, cwd: live.cwd, chars: sent.length });
          return res
            .status(STATUS_OF["typed-not-submitted"])
            .json({ error: "typed-not-submitted", askId, message: "A dialog opened before Enter: the text is in the session's input box, not submitted." });
        }
        const code = (await holdOf(deps, sessionId)) ?? "question-open";
        return fail(res, code, HOLD_MESSAGE[code] ?? code);
      }
      return fail(res, "send-failed", `Could not type into session ${sessionId}: ${messageOf(err)}`);
    }
    await deps.record({ at: new Date(deps.now()).toISOString(), label: settings.label, askId, session: sessionId, cwd: live.cwd, chars: sent.length });
    res.status(202).json({ askId, session: sessionId, cwd: live.cwd, sentText: sent });
  });
}

function mountWait(app: Express, deps: ExternalAskRouteDeps): void {
  app.get("/api/external/sessions/:sessionId/asks/:askId", async (req, res) => {
    const settings = await admitted(req, res, deps);
    if (settings === null) return;
    const { sessionId, askId } = req.params;
    if (!SESSION_ID_RE.test(sessionId) || !ASK_ID_RE.test(askId)) return fail(res, "invalid-request", "invalid sessionId or askId");
    const agent = deps.agentOf(sessionId);
    if (agent === null && !(await deps.sessionExists(sessionId))) return fail(res, "no-session", `Session ${sessionId} is not known to this MulmoTerminal.`);
    if (!readableAgent(agent)) return fail(res, "unsupported-agent", `Replies from a ${agent ?? "unknown"} session cannot be read.`);
    // Before a response is written, "close" means the caller hung up.
    let hungUp = false;
    res.on("close", () => (hungUp = true));
    try {
      const state = await pollAnswer(deps, { sessionId, askId, agent, waitMs: waitMsOf(req.query.waitSeconds), hungUp: () => hungUp });
      if (state === null) return;
      if (state.status === "cleared") return fail(res, "conversation-cleared", "The session's conversation was cleared; its answer cannot be read.");
      if (state.status === "answered") return res.json({ status: "answered", reply: state.reply });
      if (!(await deps.sessionExists(sessionId))) return fail(res, "session-ended", `Session ${sessionId} ended before it answered.`);
      return res.json({ status: "pending", seen: state.seen, working: deps.describe(sessionId).working });
    } catch (err) {
      if (!hungUp) fail(res, "read-failed", `Could not read session ${sessionId}'s answer: ${messageOf(err)}`);
    }
  });
}

/** Read until the answer is there, the conversation is gone, or the wait runs out — or null when the
 *  caller hung up and nobody is left to tell. Read before the first sleep, so an answer already on
 *  disk is given at once. */
async function pollAnswer(
  deps: ExternalAskRouteDeps,
  ask: { sessionId: string; askId: string; agent: TerminalAgent; waitMs: number; hungUp: () => boolean },
): Promise<ExternalReadResult | null> {
  const startedAt = deps.now();
  for (;;) {
    const state = await deps.readAnswer(ask.sessionId, ask.askId, ask.agent);
    if (state.status !== "pending" || deps.now() - startedAt >= ask.waitMs) return state;
    await deps.sleep(EXTERNAL_POLL_MS);
    if (ask.hungUp()) return null;
  }
}

export function mountExternalAskRoutes(app: Express, deps: ExternalAskRouteDeps): void {
  mountList(app, deps);
  mountSend(app, deps);
  mountWait(app, deps);
}
