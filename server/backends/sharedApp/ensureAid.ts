// Ensure app.json has a valid aid UUID
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { APP_MANIFEST_FILE } from "@mulmoclaude/core/collection/server";
import { isRecord } from "../../../common/isRecord.js";

export interface EnsureAidSuccess {
  ok: true;
  aid: string;
  created: boolean;
}

export type EnsureAidResult = EnsureAidSuccess | { ok: false; problems: string[] };

export async function ensureAid(root: string): Promise<EnsureAidResult> {
  const manifestPath = path.join(root, APP_MANIFEST_FILE);
  let raw: string;
  let app: unknown;

  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch (err) {
    return {
      ok: false,
      problems: [`cannot read app.json: ${String(err)}`, "Create app.json first with the required fields (name, collections)."],
    };
  }

  try {
    app = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      problems: [`app.json is not valid JSON: ${String(err)}`],
    };
  }

  if (!isRecord(app)) {
    return {
      ok: false,
      problems: [`app.json must be an object, got ${Array.isArray(app) ? "array" : typeof app}`],
    };
  }

  const current = app.aid;
  if (typeof current === "string" && current.length > 0) {
    return { ok: true, aid: current, created: false };
  }

  const aid = uuidv4();
  const updated = { ...app, aid };

  try {
    await writeFile(manifestPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  } catch (err) {
    return {
      ok: false,
      problems: [`failed to write app.json: ${String(err)}`, "The file must be writable and directory accessible."],
    };
  }

  return { ok: true, aid, created: true };
}
