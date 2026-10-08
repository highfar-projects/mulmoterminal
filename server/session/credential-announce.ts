// Sending the `credential` frame to a cell (#2919).
import { getTokenRotation } from "../config/config-routes.js";
import { credentialFrameFor } from "./credential-frame.js";
import { sessionToken } from "./token-sessions.js";
import { sendFrame, type FrameSocket } from "./ws-frames.js";

/** Which rotation credential this session's process runs on: the token just chosen for a new process,
 *  or the one a reattached process was recorded on. Both paths must call it — a reattach starts
 *  nothing, and a freshly loaded page has no other way to learn the token. */
export function announceCredential(sessionId: string, ws: FrameSocket | null): void {
  const frame = credentialFrameFor(getTokenRotation(), sessionToken(sessionId));
  if (frame) sendFrame(ws, frame);
}
