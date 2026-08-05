// Rooms on disk: where they live, and the two things anybody does with one (#1456).
//
// A room is the conversation itself, kept apart from the agents having it. That is what lets a
// human at the CLI, a CI job, and the round-table runner all take part in the same exchange — and
// what lets the conversation outlive the browser tab that started it.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mulmoterminalHome } from "../infra/mulmoterminal-home.js";
import { messageLine, parseRoom } from "./room-log.js";
import { clipMessage, isRoomId, type RoomMessage } from "../../common/roomMessage.js";

const ROOMS_DIR = "rooms";
const ROOM_EXT = ".jsonl";

/** Where rooms live. A function, not a constant, so MULMOTERMINAL_HOME redirects it the way it
 *  redirects everything else this app persists. */
export const roomsDir = (): string => path.join(mulmoterminalHome(), ROOMS_DIR);

/** The file for a room, or null when the id is not one.
 *
 *  The id check is the WHOLE path defence, so it happens here rather than being assumed of the
 *  caller: `isRoomId` allows no separator and no dot, so the join cannot leave the directory.
 *  Every entry point goes through this function for that reason. */
export function roomFile(room: string): string | null {
  return isRoomId(room) ? path.join(roomsDir(), `${room}${ROOM_EXT}`) : null;
}

/** Everything said in a room, oldest first. An unknown room is empty rather than an error: a
 *  reader asking about a conversation that has not started yet is not a failure. */
export function readRoom(room: string): RoomMessage[] {
  const file = roomFile(room);
  if (!file) return [];
  try {
    // Bounded by how much was posted, which is capped per message and written only by this
    // machine's own tools — but a room is a CONVERSATION, and those grow. Read whole for now;
    // if a room ever needs to outgrow memory it wants a tail read, not a bigger buffer.
    return existsSync(file) ? parseRoom(readFileSync(file, "utf8")) : [];
  } catch {
    return [];
  }
}

/** Append one message. Returns what was stored (the text may have been clipped), or null when the
 *  room id is not one — so a caller can answer 400 rather than guessing. */
export function postToRoom(room: string, from: string, text: string, at: number = Date.now()): RoomMessage | null {
  const file = roomFile(room);
  if (!file) return null;
  const message: RoomMessage = { at, from, text: clipMessage(text) };
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, messageLine(message), "utf8");
    return message;
  } catch (err) {
    console.warn(`[rooms] could not post to ${room}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** The rooms that exist, newest activity first. Reads names only — a listing that parsed every
 *  room would cost the whole history of every conversation to answer "which ones are there". */
export function listRooms(): string[] {
  try {
    return readdirSync(roomsDir(), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(ROOM_EXT))
      .map((entry) => entry.name.slice(0, -ROOM_EXT.length))
      .filter(isRoomId)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
