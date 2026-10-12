// The routes behind `showInPane` and `requestCheck` (#3022), and the open check a reloaded browser
// asks for. The caller's session comes from the MCP broker's header, so a command only ever reaches
// the cell that sent it; a path is contained in that session's directory before it is published.
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { SESSION_HEADER, sessionIdFromHeader } from "../backends/files/presentPathRoot.js";
import { cwdForSessionHydrated } from "../session/session-cwd.js";
import { realpathOr, resolveContained } from "../files/pathContainment.js";
import { isRecord } from "../../common/isRecord.js";
import { SESSION_ID_RE } from "../config/env.js";
import { PANE_COMMAND_CHANNEL, parseCheckRequest, parseTarget, type PaneCheck, type PaneTarget } from "../../common/paneCommand.js";

export interface PaneToolRouteDeps {
  publish: (channel: string, data: unknown) => void;
}

/** `target.path` relative to `cwd` with `/`, or null when it is not a file inside it. */
function containedTarget(cwd: string, target: PaneTarget): PaneTarget | null {
  const absolute = resolveContained(cwd, target.path, os.homedir());
  if (!absolute) return null;
  // Against the directory's REAL path: `resolveContained` answers with one, and a cwd reached through
  // a symlink (`/tmp` on macOS) would otherwise turn into a `../../private/…` climb.
  const relative = path
    .relative(realpathOr(path.resolve(cwd)), absolute)
    .split(path.sep)
    .join("/");
  return relative === "" ? null : { ...target, path: relative };
}

const outside = (target: PaneTarget): string => `${target.path} is not inside your working directory, so it cannot be shown in your pane.`;

/** The open check per session — one at a time; a new one replaces it. Read back by a browser that
 *  reloaded or reconnected after it was published, since the channel replays nothing. */
const openChecks = new Map<string, PaneCheck>();

function mountShowInPane(app: Express, deps: PaneToolRouteDeps): void {
  app.post("/api/plugin/showInPane", async (req, res) => {
    const sessionId = sessionIdFromHeader(req.get(SESSION_HEADER));
    if (!sessionId) return res.json({ message: "showInPane works only from a MulmoTerminal terminal." });
    const target = parseTarget(req.body);
    if (!target) return res.json({ message: "showInPane needs a `path`, and `view` must be editor, preview, canvas or split." });
    const cwd = await cwdForSessionHydrated(sessionId);
    const contained = containedTarget(cwd, target);
    if (!contained) return res.json({ message: outside(target) });
    deps.publish(PANE_COMMAND_CHANNEL, { kind: "show", sessionId, cwd, ...contained });
    const where = contained.line ? `line ${contained.line}` : contained.view;
    return res.json({ message: `Shown ${contained.path} (${where}) in your pane.` });
  });
}

function mountRequestCheck(app: Express, deps: PaneToolRouteDeps): void {
  app.post("/api/plugin/requestCheck", async (req, res) => {
    const sessionId = sessionIdFromHeader(req.get(SESSION_HEADER));
    if (!sessionId) return res.json({ message: "requestCheck works only from a MulmoTerminal terminal." });
    const request = parseCheckRequest(req.body);
    if (typeof request === "string") return res.json({ message: request });
    const cwd = await cwdForSessionHydrated(sessionId);
    const escaped = request.items.find((item) => item.target && !containedTarget(cwd, item.target));
    if (escaped?.target) return res.json({ message: outside(escaped.target) });
    const items = request.items.map((item) => {
      const target = item.target ? containedTarget(cwd, item.target) : null;
      return target ? { label: item.label, target } : { label: item.label };
    });
    const check: PaneCheck = { kind: "check", sessionId, cwd, id: randomUUID(), title: request.title, items };
    openChecks.set(sessionId, check);
    deps.publish(PANE_COMMAND_CHANNEL, check);
    return res.json({
      message: `Showed ${items.length} item(s) to the user in your pane. Finish your turn now; their OK / NG results arrive as their next message.`,
    });
  });
}

function mountOpenCheck(app: Express): void {
  app.get("/api/pane/check/:sessionId", (req, res) => {
    if (!SESSION_ID_RE.test(req.params.sessionId)) return res.status(400).json({ error: "invalid sessionId" });
    return res.json({ check: openChecks.get(req.params.sessionId) ?? null });
  });
  // Answered or put away in the browser. Only the check that was asked about is dropped: a newer one
  // published meanwhile stays open.
  app.post("/api/pane/check/:sessionId/close", (req, res) => {
    if (!SESSION_ID_RE.test(req.params.sessionId)) return res.status(400).json({ error: "invalid sessionId" });
    const id = isRecord(req.body) && typeof req.body.id === "string" ? req.body.id : null;
    if (id !== null && openChecks.get(req.params.sessionId)?.id === id) openChecks.delete(req.params.sessionId);
    return res.json({ ok: true });
  });
}

/** MUST precede mountAllRoutes' /api/plugin/:toolName catch-all, which would otherwise take them. */
export function mountPaneToolRoutes(app: Express, deps: PaneToolRouteDeps): void {
  mountShowInPane(app, deps);
  mountRequestCheck(app, deps);
  mountOpenCheck(app);
}
