import type { Express } from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { existingWorkspace } from "../config/workspace.js";
import { dirSuggestions } from "./dirSuggestion.js";
import { DIR_SUGGEST_ROUTE, type DirSuggestResponse } from "../../common/dirSuggest.js";

// A symlink's Dirent says "symlink", not what it points at, so a linked project would never be
// offered without the extra stat. A child that cannot be read is simply not offered.
async function isDirEntry(dir: string, entry: { name: string; isDirectory(): boolean; isSymbolicLink(): boolean }): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await fs.stat(path.join(dir, entry.name))).isDirectory();
  } catch {
    return false;
  }
}

// A parent that is missing or unreadable has no children to offer — an empty list, not an error,
// because the caller is a form being typed into.
export async function listSubdirNames(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const flags = await Promise.all(entries.map((entry) => isDirEntry(dir, entry)));
    return entries.filter((_, index) => flags[index]).map((entry) => entry.name);
  } catch {
    return [];
  }
}

// `exists` is `existingWorkspace`, the rule the spawn refuses by, so the form cannot call a path
// launchable that the server then turns away. A GET with no origin guard, as
// `/api/files/browse/list` already lists any directory: a cross-origin page cannot read the answer.
export function mountDirSuggestRoute(app: Express, homeDir: string = os.homedir()): void {
  app.get(DIR_SUGGEST_ROUTE, async (req, res) => {
    const typed = req.query.path;
    if (typeof typed !== "string") return res.status(400).json({ error: "path must be given exactly once" });
    const body: DirSuggestResponse = {
      exists: typed !== "" && existingWorkspace(typed, homeDir) !== null,
      suggestions: await dirSuggestions(typed, homeDir, listSubdirNames),
    };
    res.json(body);
  });
}
