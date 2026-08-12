// The `aid` is generated HERE, by code, when `app.json` does not have one yet.
//
// Not by the agent (design D2b): `apps/{aid}` is a shelf every user of the deployment shares, and
// the rules' `allow create` asks only that you name yourself owner — so a memorable aid is
// first-come-first-served, cannot be checked for availability (the app document is not readable
// until you are on its roster), and frees up again when an app is deleted. A UUID has none of
// those properties, and a model asked to invent an identifier writes a memorable one.
//
// And it happens when `app.json` is WRITTEN rather than at publish: `acceptStorageSchema` refuses
// a firestore schema whose root declares no aid, so waiting until publish would make the author's
// first collection unopenable until they had published — the wrong end of the process to discover
// it from.
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_MANIFEST_FILE } from "@mulmoclaude/core/collection/server";
import { isRecord } from "../../../common/isRecord.js";

export interface EnsureAidSuccess {
  ok: true;
  aid: string;
  /** Whether this call minted it. Reported rather than inferred, because "your app.json now says
   *  something it did not say a moment ago" is a thing the operator should hear once. */
  created: boolean;
}

export type EnsureAidResult = EnsureAidSuccess | { ok: false; problems: string[] };

/** Read `<root>/app.json`, and give it an `aid` if it has none.
 *
 *  Everything else in the file is carried through untouched — this rewrites the declaration the
 *  author is editing, so anything it dropped would be silently deleted work.
 *
 *  It does NOT create `app.json`. A missing one means this directory is not a shared app at all,
 *  and writing a bare `{ aid }` would turn a typo'd path into an app declaration. */
export async function ensureAid(root: string): Promise<EnsureAidResult> {
  const manifestPath = path.join(root, APP_MANIFEST_FILE);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch (err) {
    return {
      ok: false,
      problems: [
        `cannot read ${manifestPath}: ${String(err)}`,
        "A shared app is a repository with an app.json at its root. Write one first — this step only fills in the aid.",
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, problems: [`${manifestPath} is not valid JSON: ${String(err)}`] };
  }
  if (!isRecord(parsed)) {
    return { ok: false, problems: [`${manifestPath} must contain a JSON object.`] };
  }

  const current = parsed.aid;
  if (typeof current === "string" && current.length > 0) return { ok: true, aid: current, created: false };

  const aid = randomUUID();
  try {
    // Two spaces and a trailing newline: this file is committed and edited by hand, so it is
    // written the way the author would have.
    await writeFile(manifestPath, `${JSON.stringify({ ...parsed, aid }, null, 2)}\n`, "utf-8");
  } catch (err) {
    return {
      ok: false,
      problems: [`cannot write ${manifestPath}: ${String(err)}`, "Nothing else was changed."],
    };
  }
  return { ok: true, aid, created: true };
}
