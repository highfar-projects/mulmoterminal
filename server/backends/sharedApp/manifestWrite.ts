// Editing `app.json` — the one file in a shared app that both a person and this server write.
//
// Everything here exists because of that shared ownership. The file holds the roster and the
// public settings; the author edits it by hand and commits it; and two of MulmoTerminal's own
// steps have to change one key in it (the generated `aid`, and the URL slug that was actually
// reserved). So a write here is never "produce the file" — it is "change one key of the file
// somebody else is keeping", which is why it reads, mutates, and replaces rather than rendering.
//
// Three properties are load-bearing, and each was a review finding before it was a rule:
//
//   - **atomic.** `writeFile` truncates first, so a failure part-way leaves a half-written
//     declaration — and nothing here could put back the roster it destroyed. Write beside it and
//     rename; a reader sees the old file or the new one.
//   - **the author's file, not ours.** The mode is preserved (a manifest kept at 0600 must not
//     come back 0644), a symlink is followed to the file it points at rather than replaced, and
//     every key the author wrote is carried through untouched.
//   - **one writer at a time.** Read-mutate-write is three steps; two callers interleaving them
//     both see the old file and one write is lost. Serialized on the RESOLVED path, because two
//     spellings of one root are one file.
import { chmod, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_MANIFEST_FILE } from "@mulmoclaude/core/collection/server";
import { isRecord } from "../../../common/isRecord.js";

export type ManifestFailure = { ok: false; problems: string[] };

/** What a caller does with the declaration it was handed: a replacement object, or `null` for
 *  "nothing to change" — which writes nothing at all rather than rewriting identical bytes. */
export type ManifestMutation = (manifest: Record<string, unknown>) => Record<string, unknown> | null;

export type ManifestUpdate = { ok: true; manifest: Record<string, unknown>; written: boolean } | ManifestFailure;

/** One write at a time per `app.json`, in this process.
 *
 *  In-process is the honest scope, and it is the scope of the problem: MulmoTerminal is ONE
 *  server, every cell's tool call runs in it, and "two cells deployed at once" is how this
 *  happens. Two separate servers over one checkout would still race, and a lock file is what that
 *  would need — not written, because nothing here can produce that arrangement.
 *
 *  Keyed by the manifest PATH so two roots do not wait on each other, and entries are dropped
 *  when the last one settles so the map does not grow with every project ever deployed. */
const inFlight = new Map<string, Promise<unknown>>();

function serialize<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = inFlight.get(key) ?? Promise.resolve();
  // `catch` before `then`: a rejected predecessor must not reject its successor, and a settled
  // chain is the only thing this needs from it.
  const next = previous.catch(() => {}).then(run);
  inFlight.set(key, next);
  void next
    .catch(() => {})
    .finally(() => {
      if (inFlight.get(key) === next) inFlight.delete(key);
    });
  return next;
}

/** The key two callers must AGREE on to be serialized against each other: one file, one key.
 *
 *  The caller's spelling will not do. A root arrives as the session's cwd, which is taken
 *  verbatim — so one cell opened at a symlink and another at the path it points to name the same
 *  `app.json` in two ways, and two spellings are two chains: exactly the interleaving the
 *  serializer exists to prevent, with the lock quietly not held.
 *
 *  When `realpath` fails — the root does not exist — `resolve` is enough: the read is about to
 *  fail anyway, and a key that cannot be canonicalised must still not collide with another
 *  root's. */
async function manifestKey(root: string): Promise<string> {
  try {
    return path.join(await realpath(root), APP_MANIFEST_FILE);
  } catch {
    return path.join(path.resolve(root), APP_MANIFEST_FILE);
  }
}

/** Read `<root>/app.json`, hand it to `mutate`, and replace it with the result.
 *
 *  It does NOT create `app.json`. A missing one means this directory is not a shared app at all,
 *  and writing a bare object would turn a mistyped path into an app declaration. */
export function updateManifest(root: string, mutate: ManifestMutation): Promise<ManifestUpdate> {
  return manifestKey(root).then((key) => serialize(key, () => updateOnce(root, mutate)));
}

async function updateOnce(root: string, mutate: ManifestMutation): Promise<ManifestUpdate> {
  const manifestPath = path.join(root, APP_MANIFEST_FILE);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch (err) {
    return {
      ok: false,
      problems: [
        `cannot read ${manifestPath}: ${String(err)}`,
        "A shared app is a repository with an app.json at its root. Write one first — this step only fills in what it can.",
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

  const updated = mutate(parsed);
  if (updated === null) return { ok: true, manifest: parsed, written: false };

  const failure = await replaceManifest(manifestPath, updated);
  return failure ?? { ok: true, manifest: updated, written: true };
}

/** Replace the file, or say why not. Returns null when it landed. */
async function replaceManifest(manifestPath: string, manifest: Record<string, unknown>): Promise<ManifestFailure | null> {
  // Two spaces and a trailing newline: this file is committed and edited by hand, so it is
  // written the way the author would have.
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  // Beside the RESOLVED file, not beside the name we were given. `readFile` follows a symlink;
  // `rename` replaces one. A manifest linked to a shared declaration would otherwise be read
  // through the link and then have the link overwritten by a detached copy — the target never
  // gets the change, and the next reader of the target is looking at a different app.
  //
  // Same directory on purpose: a rename across filesystems is a copy, and the temp directory is
  // routinely on another one.
  const target = await realpath(manifestPath).catch(() => manifestPath);
  const scratch = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  try {
    await writeFile(scratch, body, "utf-8");
    // The replacement is a NEW file, so it carries this process's umask rather than the mode the
    // author gave `app.json`. Carrying the declaration through unchanged has to include that.
    await chmod(scratch, (await stat(target)).mode);
    await rename(scratch, target);
    return null;
  } catch (err) {
    // Best effort: the scratch file is only litter, and the failure being reported is the one
    // worth reporting.
    await unlink(scratch).catch(() => {});
    return {
      ok: false,
      problems: [`cannot write ${manifestPath}: ${String(err)}`, "Nothing else was changed — the declaration is as it was."],
    };
  }
}
