// Talking to a conversation room from the browser (#1456).
//
// Thin on purpose: the interesting decisions — what a window is, how a room reads to an agent —
// are pure and live in `common/roomMessage.ts`, so both this and the server render the same thing.
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { RoomMessage } from "../../common/roomMessage";

const REQUEST_TIMEOUT_MS = 10_000;

const isRoomMessage = (value: unknown): value is RoomMessage =>
  isRecord(value) && typeof value.at === "number" && typeof value.from === "string" && typeof value.text === "string";

/** Everything said in a room. An unreachable server answers an empty conversation rather than
 *  throwing: the caller is mid-table, and losing the record is not a reason to stop the table. */
export async function fetchRoom(room: string, since = 0): Promise<RoomMessage[]> {
  try {
    const res = await fetchWithTimeout(`/api/rooms/${encodeURIComponent(room)}?since=${since}`, {}, REQUEST_TIMEOUT_MS);
    if (!res.ok) return [];
    const data = await jsonBody(res);
    return isUnknownArray(data.messages) ? data.messages.filter(isRoomMessage) : [];
  } catch {
    return [];
  }
}

/** Append one message. Swallows failure for the reason above — a room that cannot be written is
 *  a lost record, not a lost conversation. */
export async function postRoomMessage(room: string, from: string, text: string): Promise<void> {
  if (!text.trim()) return;
  try {
    await fetchWithTimeout(
      `/api/rooms/${encodeURIComponent(room)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, text }) },
      REQUEST_TIMEOUT_MS,
    );
  } catch {
    // ignored — see above
  }
}
