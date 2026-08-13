import { isRecord } from "../../common/isRecord";
import { isAskQuestionEvent, type AskQuestionEvent } from "../../common/askQuestion";
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
