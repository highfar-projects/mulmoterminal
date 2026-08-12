// The URL name — reserving it at deploy, and flipping it public at publish.
//
// An app is handed out as `https://<host>/{slug}`, and `appSlugs/{slug}` is what resolves that
// name to an aid. Two things about that document shape the whole of this file:
//
//   - it is a TOP-LEVEL collection, because the public page has to resolve a slug BEFORE it can
//     read anything under `apps/{aid}`;
//   - it is UNREADABLE until the app is published (`allow read: if resource.data.published ==
//     true`), so that a human-readable name cannot be guessed to discover the aid — which is the
//     `/staging/{aid}` entrance.
//
// The second one is why this is more than a write. Nobody — the owner included — can ask which
// slug an app already holds, so `app.json` is the record: the reserved name is written back
// there, and a slug already recorded is never re-reserved. "Once you have it, you keep it" is
// the point (D2b) — a URL is a thing people have already sent to each other.
import { APP_SLUGS_COLLECTION, appSlugDoc } from "@mulmoclaude/core/collection/server";
import type { SharedAppFailure, SharedAppHandle } from "./context.js";
import { updateManifest } from "./manifestWrite.js";

/** How many numbered alternatives to try before giving up. The number is small on purpose: past
 *  `sakura-hair-8`, the author wanted a different name, not another digit. */
const MAX_CANDIDATES = 8;

export interface SlugReservation {
  ok: true;
  /** The slug this app holds now — the wanted one, or the numbered alternative that was free. */
  slug: string;
  /** Whether this call took it. False means it was already recorded in `app.json`. */
  reserved: boolean;
}

export type SlugResult = SlugReservation | SharedAppFailure;

/** `sakura-hair`, `sakura-hair-2`, `sakura-hair-3`, … — the collision rule from D2b.
 *
 *  Numbering starts at 2 because the unnumbered one IS the first: `sakura-hair-1` beside a
 *  `sakura-hair` owned by someone else reads as two apps of one company rather than a name that
 *  was taken. */
function candidates(wanted: string): string[] {
  return [wanted, ...Array.from({ length: MAX_CANDIDATES - 1 }, (_, index) => `${wanted}-${index + 2}`)];
}

/** Reserve the declared slug (or the first free numbering of it) and record it in `app.json`.
 *
 *  `recorded` is what the declaration said BEFORE this deploy — when it names a slug this app
 *  already reserved, nothing is done at all. That is the whole reason the write-back exists: a
 *  reservation cannot be read back, so re-reserving on every deploy would hand the app a new URL
 *  each time somebody deployed.
 *
 *  Ordering: this runs AFTER `apps/{aid}` is written, because the reservation's `allow create`
 *  resolves the owner through `get(apps/{aid})` — on a first deploy there is nothing to resolve
 *  until that document exists. */
export async function reserveSlug(handle: SharedAppHandle, aid: string, root: string, wanted: string, alreadyHeld: boolean): Promise<SlugResult> {
  if (alreadyHeld) return { ok: true, slug: wanted, reserved: false };

  const taken: string[] = [];
  for (const candidate of candidates(wanted)) {
    let claimed: boolean;
    try {
      // `create`, not `set`: create-if-absent is atomic, so two apps racing for one name cannot
      // both observe it missing. `set` would take a name somebody else already holds — or, worse,
      // rewrite `published` on it.
      claimed = await handle.docs.create(APP_SLUGS_COLLECTION, candidate, appSlugDoc(aid, false));
    } catch (err) {
      return {
        ok: false,
        partial: true,
        problems: [
          `deploy reached the app and its schemas, but could not reserve the URL name '${candidate}': ${err instanceof Error ? err.message : String(err)}`,
          "The app is deployed and the roster can use /staging/{aid}; only the public URL is unreserved. Deploying again retries just this step.",
        ],
      };
    }
    if (!claimed) {
      taken.push(candidate);
      continue;
    }
    const recorded = await recordSlug(root, candidate);
    return recorded ?? { ok: true, slug: candidate, reserved: true };
  }
  return {
    ok: false,
    partial: true,
    problems: [
      `every candidate for the URL name is taken: ${taken.join(", ")}.`,
      "The app itself is deployed — this is only the public name. Choose a different `slug` in app.json and deploy again.",
    ],
  };
}

/** Write the reserved name back, so the next deploy does not reserve a second one.
 *
 *  Returns a failure only when the write failed, and that failure is REAL rather than cosmetic:
 *  the reservation is live and unreadable, so a lost write-back means the next deploy takes
 *  another name and the first one is held forever by an app that no longer claims it. */
async function recordSlug(root: string, slug: string): Promise<SharedAppFailure | null> {
  const updated = await updateManifest(root, (manifest) => (manifest.slug === slug ? null : { ...manifest, slug }));
  if (updated.ok) return null;
  return {
    ok: false,
    partial: true,
    problems: [
      `the URL name '${slug}' was reserved, but writing it back to app.json failed:`,
      ...updated.problems,
      `Put \`"slug": "${slug}"\` in app.json by hand before deploying again — a reservation cannot be read back, so a deploy that does not find it there will reserve ANOTHER name and leave this one held by nobody.`,
    ],
  };
}

/** Flip the reservation's visibility. `true` is publish (the name starts resolving), `false` is
 *  unpublish (it stops).
 *
 *  A full replacement rather than a field update: `appSlugDoc` is two fields, both of which this
 *  operation knows, and the `FirestoreDocs` seam has no field-level write. The rules pin `aid`
 *  across an update, so a replacement naming a different app is refused rather than accepted. */
export function setSlugPublished(handle: SharedAppHandle, aid: string, slug: string, published: boolean): Promise<void> {
  return handle.docs.set(APP_SLUGS_COLLECTION, slug, appSlugDoc(aid, published));
}
