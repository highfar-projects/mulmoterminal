// The routes behind the tree's file operations (#2578). Each takes the pane's `?cwd=` base and a
// `?path=` under it, like every browse route, and answers with the new path relative to the base.
import os from "node:os";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { requestBody } from "../routes/requestBody.js";
import { createEntry, entryExists, entryUnder, moveToTrash, renameEntry, trashLayout, validEntryName, type EntryKind, type TrashLayout } from "./tree-ops.js";

interface TreeRouteDeps {
  /** The browse base for a raw `?cwd=` value — the same one the other browse routes use. */
  base: (cwd: unknown) => string;
  /** Where deleted entries go; the machine's own Trash unless a spec gives it another. */
  trash?: () => TrashLayout;
}

const systemTrash = (): TrashLayout => trashLayout(process.platform, process.env, os.homedir());

const relPath = (req: Request): string => (typeof req.query.path === "string" ? req.query.path : "");
const isEntryKind = (value: unknown): value is EntryKind => value === "file" || value === "dir";

/** The entry the request names, or null with a 403 already sent. */
function entryFor(req: Request, res: Response, deps: TreeRouteDeps): { abs: string } | null {
  const base = deps.base(req.query.cwd);
  const abs = entryUnder(base, relPath(req), os.homedir());
  if (!abs) {
    res.status(403).json({ error: "path escapes the project root" });
    return null;
  }
  return { abs };
}

function mountCreate(app: Express, deps: TreeRouteDeps): void {
  // `path` is the directory the entry goes in ("" for the root); the name is the body's.
  app.post("/api/files/browse/create", (req, res) => {
    const { name, kind } = requestBody(req.body);
    if (!validEntryName(name) || !isEntryKind(kind)) return res.status(400).json({ error: "body.name (a single name) and body.kind (file|dir) required" });
    const base = deps.base(req.query.cwd);
    const dirRel = relPath(req);
    const target = entryUnder(base, dirRel === "" ? name : `${dirRel}/${name}`, os.homedir());
    if (!target) return res.status(403).json({ error: "path escapes the project root" });
    if (entryExists(target)) return res.status(409).json({ error: "a file or folder with that name already exists" });
    try {
      createEntry(target, kind);
      res.json({ ok: true, path: dirRel === "" ? name : `${dirRel}/${name}` });
    } catch {
      res.status(500).json({ error: "could not create it" });
    }
  });
}

function mountRename(app: Express, deps: TreeRouteDeps): void {
  app.post("/api/files/browse/rename", (req, res) => {
    const { name } = requestBody(req.body);
    if (!validEntryName(name)) return res.status(400).json({ error: "body.name (a single name) required" });
    const entry = entryFor(req, res, deps);
    if (!entry) return;
    if (!entryExists(entry.abs)) return res.status(404).json({ error: "not found" });
    try {
      if (renameEntry(entry.abs, path.join(path.dirname(entry.abs), name)) === "exists") {
        return res.status(409).json({ error: "a file or folder with that name already exists" });
      }
      const rel = relPath(req);
      const slash = rel.lastIndexOf("/");
      res.json({ ok: true, path: slash === -1 ? name : `${rel.slice(0, slash)}/${name}` });
    } catch {
      res.status(500).json({ error: "could not rename it" });
    }
  });
}

function mountTrash(app: Express, deps: TreeRouteDeps): void {
  app.get("/api/files/browse/trash", (_req, res) => {
    res.json({ available: (deps.trash ?? systemTrash)() !== null });
  });
  app.post("/api/files/browse/trash", (req, res) => {
    const layout = (deps.trash ?? systemTrash)();
    if (!layout) return res.status(501).json({ error: "no Trash on this system" });
    const entry = entryFor(req, res, deps);
    if (!entry) return;
    if (!entryExists(entry.abs)) return res.status(404).json({ error: "not found" });
    try {
      if (moveToTrash(entry.abs, layout, new Date()) === "other-volume") {
        return res.status(409).json({ error: "it is on another volume than the Trash, so it was left in place" });
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "could not move it to the Trash" });
    }
  });
}

export function mountFilesTreeRoutes(app: Express, deps: TreeRouteDeps): void {
  mountCreate(app, deps);
  mountRename(app, deps);
  mountTrash(app, deps);
}
