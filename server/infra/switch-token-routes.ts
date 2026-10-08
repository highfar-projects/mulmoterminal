import type { Express } from "express";
import { requestOriginAllowed } from "../routes/same-origin-guard.js";
import { decideSwitch } from "../session/switch-token.js";
import { isRecord } from "../../common/isRecord.js";
import type { TokenRotation } from "../../common/tokenRotation.js";
import type { MovedFrom } from "../session/limit-rotation.js";

export interface SwitchTokenRouteDeps {
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
  isValidSessionId: (id: string) => boolean;
  rotation: () => TokenRotation;
  sessionToken: (sessionId: string) => string | undefined;
  pin: (sessionId: string, tokenId: string) => void;
  clearPin: (sessionId: string) => void;
  noteMovedFrom: (sessionId: string, move: MovedFrom) => void;
  dropMovedFrom: (sessionId: string) => void;
  labelOf: (tokenId: string) => string;
  reapSession: (id: string) => void;
  hasTmux: (id: string) => boolean;
  killTmux: (id: string) => void;
}

/** End the session's process the way the close button does, with the pick pinned for the spawn the
 *  cell's reconnect makes. `ended` is the post-condition, as POST /api/session/:id/terminate's is: the
 *  caller reconnects on it, and an unended session would hand the old process back. */
export function mountSwitchTokenRoutes(app: Express, deps: SwitchTokenRouteDeps): void {
  app.post("/api/session/:id/switch-token", (req, res) => {
    if (!requestOriginAllowed(req, deps.isAllowedOrigin)) return res.status(403).json({ error: "forbidden origin" });
    const id = req.params.id;
    if (!deps.isValidSessionId(id)) return res.status(400).json({ error: "invalid session id" });
    const current = deps.sessionToken(id);
    const decision = decideSwitch(deps.rotation(), current, isRecord(req.body) ? req.body.tokenId : undefined);
    if (!decision.ok) return res.status(decision.status).json({ error: decision.error });
    deps.pin(id, decision.tokenId);
    if (current !== undefined) deps.noteMovedFrom(id, { fromLabel: deps.labelOf(current), reason: "switched" });
    deps.reapSession(id);
    if (deps.hasTmux(id)) deps.killTmux(id);
    const ended = !deps.hasTmux(id);
    if (!ended) {
      deps.clearPin(id);
      deps.dropMovedFrom(id);
    }
    return res.json({ ok: true, ended });
  });
}
