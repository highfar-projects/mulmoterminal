// The user's own playfulEffects pictures: the list the browser picks from, and each file by its
// index in that list. The config is the allowlist: nothing here takes a path from a request.
import os from "node:os";
import type { Express, Request, Response } from "express";
import { PLAYFUL_MEDIA_ROUTE } from "../../common/playfulMedia.js";
import { getPlayfulMedia } from "../config/config-routes.js";
import { LAUNCH_DIR } from "../config/env.js";
import { mediaCatalog, publicPlayfulMedia, statMediaFile, warnPlayfulMediaOnce, type PlayableFile } from "../config/playful-media.js";

function currentCatalog() {
  const media = getPlayfulMedia();
  const catalog = mediaCatalog(media, { home: os.homedir(), launchDir: LAUNCH_DIR }, statMediaFile);
  warnPlayfulMediaOnce(catalog.warnings);
  return { media, items: catalog.items };
}

// The type comes from OUR extension map and `nosniff` holds the browser to it; `sandbox` keeps an
// SVG opened directly from scripting the app, as the directory images do (dir-routes.ts).
function sendMediaFile(res: Response, file: PlayableFile | null | undefined): void {
  if (!file) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", file.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  // dotfiles:"allow": a picture kept under ~/.mulmoterminal/ is an obvious place for one.
  res.sendFile(file.path, { dotfiles: "allow" }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
}

// Digits only, so "1abc" or "-1" is a 404 rather than whatever parseInt makes of it.
const INDEX_RE = /^\d+$/;
const itemAt = (req: Request<{ index: string }>) => (INDEX_RE.test(req.params.index) ? currentCatalog().items[Number(req.params.index)] : undefined);

export function mountPlayfulMediaRoutes(app: Express): void {
  app.get(PLAYFUL_MEDIA_ROUTE, (_req, res) => {
    const { media, items } = currentCatalog();
    res.json(publicPlayfulMedia(media, items));
  });
  app.get(`${PLAYFUL_MEDIA_ROUTE}/:index`, (req: Request<{ index: string }>, res) => sendMediaFile(res, itemAt(req)?.media));
  app.get(`${PLAYFUL_MEDIA_ROUTE}/:index/finale`, (req: Request<{ index: string }>, res) => sendMediaFile(res, itemAt(req)?.finale));
}
