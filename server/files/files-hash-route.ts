// GET /api/files/browse/sha256?cwd=&path= — a file's SHA-256, for the Files tree's row menu. Fork-only.
//
// Computed here rather than in the browser: the browser would have to download the whole file to hash
// it, and the files someone checks a hash of (an installer, an archive, a disk image) are the large
// ones. Streamed, so the size does not matter here either.
//
// The same containment as the text route, and the same re-check once the file is open (#3306): a hash
// is a fingerprint of the content, so a link out must not be followed to a file the tree cannot show.
import fs from "node:fs";
import type { Express, Request, Response } from "express";
import type { Recheck } from "./verifiedWrite.js";
import { sha256VerifiedAsync } from "./verifiedRead.js";

const ESCAPES_ROOT = { error: "path escapes the project root" };

export interface FileHashRouteDeps {
  /** The requested path resolved under the request's base, or null with the response answered. */
  contained: (req: Request, res: Response) => string | null;
  /** The containment check to ask again once the file is open. Built before the open. */
  recheck: (req: Request) => Recheck;
}

export function mountFileHashRoute(app: Express, deps: FileHashRouteDeps): void {
  app.get("/api/files/browse/sha256", async (req, res) => {
    const abs = deps.contained(req, res);
    if (!abs) return;
    const recheck = deps.recheck(req);
    const stat = await fs.promises.stat(abs).catch(() => null);
    if (stat === null) return res.status(404).json({ error: "not found" });
    // A folder has no content to hash, and a FIFO or a device would never end.
    if (!stat.isFile()) return res.status(400).json({ error: "not a file" });
    try {
      const hashed = await sha256VerifiedAsync(abs, recheck);
      if (hashed === null) return res.status(403).json(ESCAPES_ROOT);
      res.json(hashed);
    } catch {
      res.status(500).json({ error: "failed to read file" });
    }
  });
}
