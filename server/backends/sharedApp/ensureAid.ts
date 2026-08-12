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
import { chmod, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
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
/** One write at a time per `app.json`, in this process.
 *
 *  Read-mint-write is three steps, and two callers interleaving them both see "no aid", mint
 *  different UUIDs, and each rename its own file. The loser's uuid is the one it goes on to create
 *  an app document for — leaving a live `apps/{uuid}` that the declaration no longer names, and
 *  nothing afterwards would notice.
 *
 *  A Map keyed by the manifest PATH, not the root: two roots are two files and must not wait on
 *  each other, while two spellings of one root are one file. The chain is what serializes — each
 *  caller appends to the previous promise — and entries are dropped when the last one settles so
 *  the map does not grow with every project ever deployed.
 *
 *  In-process is the honest scope, and it is the scope of the problem: MulmoTerminal is ONE server,
 *  every cell's tool call runs in it, and "two cells deployed at once" is the way this happens. Two
 *  separate servers over one checkout would still race, and a lock file is what that would need —
 *  not written, because nothing here can produce that arrangement. */
const inFlight = new Map<string, Promise<EnsureAidResult>>();

function serialize(key: string, run: () => Promise<EnsureAidResult>): Promise<EnsureAidResult> {
  const previous = inFlight.get(key) ?? Promise.resolve<EnsureAidResult>({ ok: true, aid: "", created: false });
  // `catch` before `then`: a rejected predecessor must not reject its successor, and a settled
  // chain is the only thing this needs from it.
  const next = previous.catch(() => {}).then(run);
  inFlight.set(key, next);
  void next.finally(() => {
    if (inFlight.get(key) === next) inFlight.delete(key);
  });
  return next;
}

export async function ensureAid(root: string): Promise<EnsureAidResult> {
  return serialize(await manifestKey(root), () => ensureAidOnce(root));
}

/** The key two callers must AGREE on to be serialized against each other: one file, one key.
 *
 *  The caller's spelling will not do. A root arrives as the session's cwd, which is taken
 *  verbatim — so one cell opened at a symlink and another at the path it points to name the same
 *  `app.json` in two ways, and two spellings are two chains: exactly the interleaving the
 *  serializer exists to prevent, with the lock quietly not held.
 *
 *  `realpath` resolves both the links and the relative spelling. When it fails — the root does not
 *  exist — `resolve` is enough: the read is about to fail anyway, and a key that cannot be
 *  canonicalised must still not collide with another root's. */
async function manifestKey(root: string): Promise<string> {
  try {
    return path.join(await realpath(root), APP_MANIFEST_FILE);
  } catch {
    return path.join(path.resolve(root), APP_MANIFEST_FILE);
  }
}

async function ensureAidOnce(root: string): Promise<EnsureAidResult> {
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
  // Two spaces and a trailing newline: this file is committed and edited by hand, so it is
  // written the way the author would have.
  const body = `${JSON.stringify({ ...parsed, aid }, null, 2)}\n`;
  // Write beside it and RENAME, rather than writing over it.
  //
  // `writeFile` truncates first, so a failure between the truncate and the last byte leaves a
  // half-written `app.json` — and the file it would destroy is the author's declaration, holding
  // the roster and the public settings, which nothing here could put back. Rename is atomic
  // within a directory: a reader sees the old file or the new one. That is also what makes
  // "nothing else was changed" a promise rather than a hope.
  //
  // Same directory on purpose — a rename across filesystems is a copy, and the temp directory is
  // routinely on another one.
  const scratch = path.join(path.dirname(manifestPath), `.${path.basename(manifestPath)}.${aid}.tmp`);
  try {
    await writeFile(scratch, body, "utf-8");
    // The replacement is a NEW file, so it carries this process's umask rather than the mode the
    // author gave `app.json`. Carrying the declaration through unchanged has to include that: a
    // manifest someone deliberately kept at 0600 would come back 0644 and nothing would say so.
    await chmod(scratch, (await stat(manifestPath)).mode);
    await rename(scratch, manifestPath);
  } catch (err) {
    // Best effort: the scratch file is only litter, and the failure being reported is the one
    // worth reporting.
    await unlink(scratch).catch(() => {});
    return {
      ok: false,
      problems: [`cannot write ${manifestPath}: ${String(err)}`, "Nothing else was changed — the declaration is as it was."],
    };
  }
  return { ok: true, aid, created: true };
}
