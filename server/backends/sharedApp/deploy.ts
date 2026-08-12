// deploy — put the declaration where the ROSTER can see it, and nowhere else.
//
// It is the safe half of the split (design D10): everything it writes is readable only by people
// already on the roster, so it can be run as often as anyone likes. Two things are deliberately
// absent, and both are what make that true:
//
//   - the `public` block on `apps/{aid}`. That block is what the rules read to authorize
//     anonymous access — `publicOn` and `subOpen` read the APP document, never the world-readable
//     `config/public` projection — so writing it here would open the app the moment someone
//     deployed to test.
//   - the published schemas. They go to `staging/{cid}`, which only the roster can read, so a
//     deploy against a LIVE app does not swap the view its visitors are looking at.
//
// The write order is "app document first": `appSlugs`' create rule and the staging rules both
// resolve the owner through `get(apps/{aid})`, so on a first deploy nothing else is authorized
// until that document exists.
import { isRecord } from "../../../common/isRecord.js";
import { ensureAid } from "./ensureAid.js";
import { APPS_COLLECTION, appStagingPath, projectDeploy, type PublishStamp } from "@mulmoclaude/core/collection/server";
import { gitStamp, schemasOf, sharedAppContext, type SharedAppFailure, type SharedAppHandle, type SharedAppOptions } from "./context.js";
import { recordRefusal, scanRecords } from "./records.js";
import { reserveSlug, retireSlug, type SlugResult } from "./slug.js";
import { runWrites } from "./writes.js";

export interface DeploySuccess {
  ok: true;
  aid: string;
  cids: string[];
  created: boolean;
  commit?: string | undefined;
  dirty: boolean;
  /** How many live records the pre-check found that the staged schemas reject — and whether that
   *  number is a FLOOR (the scan stops at its cap per collection). The two travel together
   *  because they are read together: reporting the number without the flag understates how much
   *  repair is owed, on the one path (a confirmed deploy) where it is already staged. */
  recordIssues: number;
  recordIssuesCapped: boolean;
  /** The URL name this app holds, once one has been reserved. Absent when `app.json` declares no
   *  `slug` — an app reachable only at `/staging/{aid}` never needs one. */
  slug?: string | undefined;
  /** cids that were staged before and are not in the repository any more — dropped by this
   *  deploy. Reported because a withdrawal is not what the operator asked for; it is what
   *  deleting a collection's directory MEANT, and the two are easy to confuse. */
  withdrawn: string[];
}

/** The app document as it stands, or the refusal.
 *
 *  The preflight read decides two things the rules care about: whether `owner` is stamped or
 *  carried forward, and which of publish's fields are carried through the replacement. A rejection
 *  here — permission, network, quota — must become the documented result rather than escape as a
 *  raw exception; it happens before any write, which is what the caller most needs told.
 *
 *  It also normalizes "was there an app document?" ONCE, for the projection and the report both.
 *  Two spellings of that question disagree the moment `get` resolves to something that is neither
 *  a record nor null: the projection stamps a fresh `owner` while the reply says "Updated". */
async function readCurrentApp(handle: SharedAppHandle, aid: string): Promise<{ ok: true; app: Record<string, unknown> | null } | SharedAppFailure> {
  try {
    const existing = await handle.docs.get(APPS_COLLECTION, aid);
    return { ok: true, app: isRecord(existing) ? existing : null };
  } catch (err) {
    return {
      ok: false,
      partial: false,
      problems: [
        `deploy failed while reading the current app document (apps/${aid}): ${err instanceof Error ? err.message : String(err)}`,
        "Nothing was written. Deploying again is safe — this read only decides whether the app is created or updated.",
      ],
    };
  }
}

/** Reserve the declared URL name if this app does not already hold it, and record the result on
 *  the app document so the next deploy does not reserve a SECOND one.
 *
 *  Undefined when the declaration names no slug: an app reachable only at `/staging/{aid}` never
 *  needs one, and reserving a name nobody asked for would take it from someone who did.
 *
 *  The extra app-document write is the price of the ordering: the reservation cannot be made
 *  before `apps/{aid}` exists, and what was reserved cannot be recorded before it is reserved. It
 *  happens only on the deploy that actually takes a name. */
async function reserveHeldSlug(
  handle: SharedAppHandle,
  aid: string,
  root: string,
  wanted: string | undefined,
  held: string | undefined,
  appDoc: Record<string, unknown>,
): Promise<SlugResult | undefined> {
  if (wanted === undefined) return undefined;
  // Whether the app is OPEN, from the document that decides it. The reservation's `published`
  // flag mirrors that, and a reclaim must not change the answer.
  const reservation = await reserveSlug(handle, aid, root, wanted, held === wanted, appDoc.public !== undefined);
  if (!reservation.ok || !reservation.reserved) return reservation;
  // A rename leaves the previous name pointing here, and a published one goes on RESOLVING —
  // while every later unpublish acts on the new name, so the URL the owner believes they took
  // down still opens the app. Retire it before the record moves, so a failure here leaves the
  // record on the old name and the next deploy repeats exactly this step.
  if (held !== undefined && held !== reservation.slug) {
    try {
      await retireSlug(handle, aid, held);
    } catch (err) {
      return {
        ok: false,
        partial: true,
        problems: [
          `the URL name '${reservation.slug}' was reserved, but the previous name '${held}' could not be retired: ${err instanceof Error ? err.message : String(err)}`,
          `Deploy again — until '${held}' is closed it still resolves to this app, and later unpublishes would not touch it.`,
        ],
      };
    }
  }
  try {
    await handle.docs.set(APPS_COLLECTION, aid, { ...appDoc, slug: reservation.slug });
  } catch (err) {
    return {
      ok: false,
      partial: true,
      problems: [
        `the URL name '${reservation.slug}' was reserved and written to app.json, but recording it on apps/${aid} failed: ${err instanceof Error ? err.message : String(err)}`,
        "Deploy again — the reservation is this app's, and the next deploy recognises that rather than taking a numbered name.",
      ],
    };
  }
  return reservation;
}

/** Staged documents whose collection this repository no longer has.
 *
 *  Dropping them is what makes staging a REPLACEMENT of the repository's shared collections rather
 *  than an accumulation of everything ever deployed. Without it, deleting a collection leaves its
 *  schema staged forever, and publish — which promotes what is staged and refuses to promote a
 *  version it cannot check against the repository — has no way forward at all.
 *
 *  Only asked when the app document already exists: the staging rules resolve the roster through
 *  `get(apps/{aid})`, so on a FIRST deploy the listing is denied rather than empty, and treating
 *  that denial as a real one would make an app impossible to create. */
async function staleStaged(
  handle: SharedAppHandle,
  aid: string,
  existingApp: Record<string, unknown> | null,
  keep: ReadonlySet<string>,
): Promise<{ ok: true; cids: string[] } | SharedAppFailure> {
  if (existingApp === null) return { ok: true, cids: [] };
  try {
    const staged = await handle.docs.list(appStagingPath(aid));
    return { ok: true, cids: staged.map((doc) => doc.id).filter((cid) => !keep.has(cid)) };
  } catch (err) {
    return {
      ok: false,
      partial: false,
      problems: [
        `deploy failed while reading what is already staged (apps/${aid}/staging): ${err instanceof Error ? err.message : String(err)}`,
        "Nothing was written. This read is what lets a deleted collection be withdrawn from staging, so deploying without it would leave a stale schema behind for publish to trip over.",
      ],
    };
  }
}

export type DeployResult = DeploySuccess | SharedAppFailure;

export async function deploySharedApp(root: string, opts: SharedAppOptions = {}): Promise<DeployResult> {
  // Before anything reads the declaration: a repository that has never been deployed has no
  // `aid` yet, and it is generated here rather than invented by the agent (D2b).
  const ensured = await ensureAid(root);
  if (!ensured.ok) return { ok: false, partial: false, problems: ensured.problems };

  const context = await sharedAppContext(root);
  if (!context.ok) return context;
  const { authored, collections, handle } = context;

  const scan = await scanRecords(collections, root);
  const refusal = recordRefusal(scan, "deploy", opts.confirm);
  if (refusal) return { ok: false, partial: false, problems: refusal };

  const { aid } = authored;
  const current = await readCurrentApp(handle, aid);
  if (!current.ok) return current;
  const stampSource = await (opts.resolveCommit ?? gitStamp)(root);
  const stamp: PublishStamp = {
    uid: handle.uid,
    email: handle.email,
    publishedAt: (opts.now ?? Date.now)(),
    commit: stampSource.commit,
    dirty: stampSource.dirty,
  };
  const existingApp = current.app;
  const deployed = projectDeploy(authored, schemasOf(collections), stamp, existingApp);

  const stale = await staleStaged(handle, aid, existingApp, new Set(deployed.staging.map((entry) => entry.cid)));
  if (!stale.ok) return stale;

  // The slug this app already holds, carried on the app document because NOTHING ELSE CAN BE
  // ASKED: `appSlugs/{slug}` is unreadable until the app is published, so "do we already have
  // one?" has no other answer. `projectDeploy` does not carry it — the reservation is the host's
  // business and core has no opinion about it — so it is re-attached here, from the document as
  // it stands, on every deploy.
  const held = typeof existingApp?.slug === "string" ? existingApp.slug : undefined;
  const appDoc = held === undefined ? deployed.app : { ...deployed.app, slug: held };

  const failure = await runWrites(
    [
      { what: `the app document (apps/${aid})`, run: () => handle.docs.set(APPS_COLLECTION, aid, appDoc) },
      ...deployed.staging.map(({ cid, doc }) => ({
        what: `the staged schema for '${cid}' (apps/${aid}/staging/${cid})`,
        run: () => handle.docs.set(appStagingPath(aid), cid, doc),
      })),
      // Withdrawals last: they grant nothing, and doing them after the writes keeps a failure
      // part-way through from leaving the roster with fewer collections than it had.
      ...stale.cids.map((cid) => ({
        what: `the withdrawal of the staged schema for '${cid}' (apps/${aid}/staging/${cid})`,
        run: async (): Promise<void> => {
          await handle.docs.delete(appStagingPath(aid), cid);
        },
      })),
    ],
    "deploy",
  );
  if (failure) return failure;

  // AFTER the app document, because `appSlugs`' create rule resolves the owner through
  // `get(apps/{aid})` — on a first deploy there is nothing to resolve until it exists.
  const slug = await reserveHeldSlug(handle, aid, root, authored.slug, held, appDoc);
  if (slug !== undefined && !slug.ok) return slug;

  return {
    ok: true,
    aid,
    slug: slug?.slug,
    cids: deployed.staging.map((entry) => entry.cid),
    withdrawn: stale.cids,
    created: existingApp === null,
    commit: stamp.commit,
    dirty: stampSource.dirty === true,
    recordIssues: scan.records,
    recordIssuesCapped: scan.capped,
  };
}
