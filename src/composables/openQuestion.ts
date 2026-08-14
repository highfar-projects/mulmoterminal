import { isRecord } from "../../common/isRecord";
import { isAnswerFailure, isAskQuestionEvent, type AnswerFailure, type AskQuestionEvent } from "../../common/askQuestion";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const REQUEST_TIMEOUT_MS = 5000;

// What the question pane's channel cannot tell a browser that arrived late: the dialog a session is
// blocked on RIGHT NOW. Pub/sub here is event-only and replays nothing on reconnect, so without
// this a reload between the question and its answer leaves the pane blind to a waiting session —
// and nothing but an arriving question opens that pane.
//
// A failure answers null rather than throwing: this runs on every enlarge, and a session with no
// question open is the ordinary case, so there is nothing to report either way.
export async function fetchOpenQuestion(sessionId: string): Promise<AskQuestionEvent | null> {
  try {
    const res = await fetchWithTimeout(`/api/question/${encodeURIComponent(sessionId)}`, undefined, REQUEST_TIMEOUT_MS);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isRecord(body) && isAskQuestionEvent(body.question) ? body.question : null;
  } catch {
    return null;
  }
}

// Answering goes through the HOST (#1685), not the terminal socket: it is the side that knows
// whether the dialog is still open, and having it build the keystrokes keeps the check and the
// typing in one step. The phone reaches the same code, so a third client would too.
export async function postAnswer(sessionId: string, toolUseId: string, picks: number[][]): Promise<AnswerFailure | null> {
  return postToAnswerRoute(sessionId, { toolUseId, picks });
}

// Taking the dialog's `Type something` row, which ENDS it as declined and returns the terminal to
// its ordinary prompt (#1693). Only the keys that close the dialog go through the host; what the
// user then says is a normal message and travels the way every other message does.
export async function postDecline(sessionId: string, toolUseId: string): Promise<AnswerFailure | null> {
  return postToAnswerRoute(sessionId, { toolUseId, decline: true });
}

async function postToAnswerRoute(sessionId: string, body: Record<string, unknown>): Promise<AnswerFailure | null> {
  try {
    const res = await fetchWithTimeout(
      `/api/question/${encodeURIComponent(sessionId)}/answer`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      REQUEST_TIMEOUT_MS,
    );
    if (res.ok) return null;
    const answered: unknown = await res.json().catch(() => null);
    return isRecord(answered) && isAnswerFailure(answered.reason) ? answered.reason : "unwritable";
  } catch {
    return "unwritable";
  }
}
