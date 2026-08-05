// The conversation rooms over HTTP (#1456).
//
// HTTP rather than an MCP tool, deliberately. A room is not an agent capability — no agent calls
// any of this. It is a place a conversation is kept, so that the things which are NOT agents can
// take part: a human at the CLI, a shell cell, a CI job. The round-table runner writes here too,
// but as the browser, not as anything the agent can reach (see #1456 / useRoundTable).
import type { Express, Request, Response } from "express";
import { requestBody } from "./requestBody.js";
import { requestOriginAllowed } from "./same-origin-guard.js";
import { listRooms, postToRoom, readRoom } from "../rooms/rooms.js";
import { messagesSince } from "../rooms/room-log.js";
import { isRoomId } from "../../common/roomMessage.js";

const MAX_FROM_CHARS = 60;

/** `since` as epoch ms, or 0. A garbage value reads as "from the beginning" rather than an error:
 *  the caller gets more than it asked for, never a room that looks empty. */
const sinceMs = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Who said it, trimmed to something a header can show. Empty falls back rather than refusing —
 *  a post that reached the room matters more than its label. */
const speaker = (raw: unknown): string => {
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_FROM_CHARS) : "";
  return name || "someone";
};

export function mountRoomRoutes(
  app: Express,
  { isAllowedOrigin }: { isAllowedOrigin: (origin: string | undefined, remote: string | undefined) => boolean },
): void {
  // The rooms that exist. Names only — see listRooms.
  app.get("/api/rooms", (_req: Request, res: Response) => {
    res.json({ rooms: listRooms() });
  });

  // One room's messages. `?since=<epoch ms>` for a caller that is following along.
  app.get("/api/rooms/:room", (req: Request, res: Response) => {
    const room = req.params.room;
    if (!isRoomId(room)) return res.status(400).json({ error: "invalid room id — lowercase letters, digits and - only" });
    try {
      return res.json({ room, messages: messagesSince(readRoom(room), sinceMs(req.query.since)) });
    } catch (err) {
      // 500, never 200-with-nothing: a caller that cannot tell "nobody has spoken" from "I could
      // not read it" will carry on without history it needed (CodeRabbit review on #1456). What to
      // DO about it is the caller's call — the round-table runner degrades to the previous turn
      // rather than ending a live conversation (see useRoundTable).
      console.warn(`[rooms] could not read ${room}: ${err instanceof Error ? err.message : String(err)}`);
      return res.status(500).json({ error: "could not read the room" });
    }
  });

  // Post. Same-origin guarded like every other mutation here: this writes to a file every agent
  // in a running table then reads, so a page on another origin must not be able to put words in
  // the conversation.
  app.post("/api/rooms/:room", (req: Request, res: Response) => {
    if (!requestOriginAllowed(req, isAllowedOrigin)) return res.status(403).end();
    const room = req.params.room;
    if (!isRoomId(room)) return res.status(400).json({ error: "invalid room id — lowercase letters, digits and - only" });
    const { from, text } = requestBody(req.body);
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text is required" });
    const message = postToRoom(room, speaker(from), text);
    if (!message) return res.status(500).json({ error: "could not write to the room" });
    res.json({ ok: true, message });
  });
}
