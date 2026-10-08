// Sending the `credential` frame to a cell (#2919).
import { getTokenRotation } from "../../config/config-routes.js";
import { credentialFrameFor } from "./credential-frame.js";
import { sessionToken } from "./token-sessions.js";
import { carrySwitchedToken } from "./token-switch-pins.js";
import { sendFrame, type FrameSocket } from "../ws-frames.js";

/** Which rotation credential this session's process runs on: the token just chosen for a new process,
 *  or the one a reattached process was recorded on. Both paths must call it — a reattach starts
 *  nothing, and a freshly loaded page has no other way to learn the token. */
export function announceCredential(sessionId: string, ws: FrameSocket | null): void {
  const frame = credentialFrameFor(getTokenRotation(), sessionToken(sessionId));
  if (frame) sendFrame(ws, frame);
}

/** What a claude connection owes the credential before its process is reached: a reattach starts
 *  nothing, so it announces the recorded token itself; a spawn announces its own, but must first take
 *  a pick made for the id this connection asked for over to the id it was actually handed (#2950). */
export function settleCredential(requestedId: string | null, sessionId: string, reattaching: boolean, ws: FrameSocket | null): void {
  if (reattaching) announceCredential(sessionId, ws);
  else if (requestedId) carrySwitchedToken(requestedId, sessionId);
}
