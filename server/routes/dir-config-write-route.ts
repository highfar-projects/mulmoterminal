// PUT /api/dir-config: the Settings form's save (#2722). It changes the keys it names and nothing
// else in the directory's files, then answers with the same detail the form was drawn from, so the
// form redraws from what is on disk rather than from what it sent.
import type { Express, Request, Response } from "express";
import { existingWorkspaceFromQuery } from "../config/workspace.js";
import { isRecord } from "../../common/isRecord.js";
import { isWritableDirConfigValue } from "../config/config-schema.js";
import { dirConfigDetail } from "../config/dir-config.js";
import { parseDirConfigEdit } from "../config/dir-config-edit.js";
import { writeDirConfigEdit } from "../config/dir-config-write.js";
import type { DirConfigEdit } from "../../common/dirConfigForm.js";

export type DirConfigWriteDeps = {
  backupRoot: string;
  /** Every open view re-reads this directory's config — the signal a Files-pane save sends too. */
  onDirConfigWritten: (dir: string) => void;
};

export function mountDirConfigWriteRoute(app: Express, deps: DirConfigWriteDeps): void {
  app.put("/api/dir-config", (req, res) => {
    dirConfigWriteHandler(req, res, deps);
  });
}

function dirConfigWriteHandler(req: Request, res: Response, { backupRoot, onDirConfigWritten }: DirConfigWriteDeps): void {
  const body: unknown = req.body ?? {};
  const cwd = isRecord(body) ? existingWorkspaceFromQuery(body.cwd) : null;
  if (!cwd) {
    res.status(400).json({ error: "cwd must name an existing directory" });
    return;
  }
  const edit = parseDirConfigEdit(body, isWritableDirConfigValue);
  if (typeof edit === "string") {
    res.status(400).json({ error: edit });
    return;
  }
  writeAndAnswer(res, cwd, edit, { backupRoot, onDirConfigWritten });
}

/** Write `edit` into the directory's files, tell the views, and answer with the directory's detail —
 *  or the reason it was not written. Shared by every route that saves a directory's config. */
export function writeAndAnswer(res: Response, cwd: string, edit: DirConfigEdit, { backupRoot, onDirConfigWritten }: DirConfigWriteDeps): void {
  try {
    const written = writeDirConfigEdit(cwd, edit, backupRoot);
    // 422 and the file's path: the form tells the user which file to fix by hand, rather than
    // replacing what they were halfway through writing.
    if (!written.ok) {
      res.status(422).json({ error: "this file is not a JSON object", file: written.unreadable });
      return;
    }
  } catch (err) {
    res.status(500).json({ error: `could not write the directory config: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  notify(onDirConfigWritten, cwd);
  res.json(dirConfigDetail(cwd));
}

// The file is already written, so a signal that fails is logged and never turns into a failed save.
function notify(onDirConfigWritten: DirConfigWriteDeps["onDirConfigWritten"], cwd: string): void {
  try {
    onDirConfigWritten(cwd);
  } catch (err) {
    console.warn("[dir-config] telling the views about a saved directory config failed", err);
  }
}
