// What the board's reply box may send to a cell (#3185), pure. The text goes through the host's
// sender (session-input.ts), which strips control bytes and presses Enter; this decides only whether
// a request is one to pass on at all.
import { SESSION_ID_RE } from "../config/env.js";
import { isRecord } from "../../common/isRecord.js";
import { sanitizeTerminalInput } from "../backends/remoteHost/terminalInput.js";

// A reply is a line typed at a prompt. Anything longer is not one, and would be pasted whole.
export const REPLY_MAX_CHARS = 4000;

const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;

export type ReplyRequest = { ok: true; sessionId: string; text: string } | { ok: false; status: number; error: string };

/** The session named in the path and the text in the body, or why they are refused. */
export function readReplyRequest(sessionId: string, body: unknown): ReplyRequest {
  if (!SESSION_ID_RE.test(sessionId)) return { ok: false, status: HTTP_BAD_REQUEST, error: "invalid sessionId" };
  const text = isRecord(body) && typeof body.text === "string" ? body.text : null;
  if (text === null) return { ok: false, status: HTTP_BAD_REQUEST, error: "text is required" };
  if (text.length > REPLY_MAX_CHARS) return { ok: false, status: HTTP_PAYLOAD_TOO_LARGE, error: `text is longer than ${REPLY_MAX_CHARS} characters` };
  if (sanitizeTerminalInput(text) === "") return { ok: false, status: HTTP_BAD_REQUEST, error: "text has nothing to type" };
  return { ok: true, sessionId, text };
}
