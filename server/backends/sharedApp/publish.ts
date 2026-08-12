// publish — promote what the roster tested, and open it LAST.
//
// The one dangerous operation in a shared app (design D10). Merging a pull request changes
// nobody's screen; publishing changes everyone's, immediately, and in two ways at once: a breaking
// schema change leaves live records inconsistent with the schema that is now supposed to describe
// them, and — because a view is HTML — the right to publish is in practice the right to run
// JavaScript in every member's browser.
//
// Two properties are load-bearing and neither is obvious from the call site:
//
//   - it PROMOTES `staging/{cid}` rather than re-projecting the working tree, so what shipped is
//     what the roster reviewed;
//   - it writes `apps/{aid}.public` LAST, as its own write, because that block — not the
//     world-readable `config/public` projection — is what the rules read to authorize anonymous
//     access. A run that stops part-way therefore leaves the app private.
//
// A re-publish passes through a moment with no `public` block. That is a brief denial for
// visitors, not a brief exposure, and it is the trade the ordering is chosen for.
import { isRecord } from "../../../common/isRecord.js";
import {
  APPS_COLLECTION,
  PUBLIC_CONFIG_DOC,
  appConfigPath,
  appSchemasPath,
  promoteSchema,
  projectPublish,
  type LoadedCollection,
  type PublishStamp,
} from "@mulmoclaude/core/collection/server";
import { gitStamp, sharedAppContext, type SharedAppFailure, type SharedAppHandle, type SharedAppOptions } from "./context.js";
import { recordRefusal, scanRecords } from "./records.js";
import { readStaged, type StagedEntry } from "./staged.js";
import { runWrites, type WriteStep } from "./writes.js";

export interface PublishSuccess {
  ok: true;
  aid: string;
  cids: string[];
  /** Whether this publish left the app open to anonymous visitors. False is a normal outcome — a
   *  declaration with no `public` block publishes the schemas to the roster's URL and grants the
   *  world nothing — and it is the one thing an operator is most likely to assume wrongly. */
  publicOpen: boolean;
  commit?: string | undefined;
  dirty: boolean;
  recordIssues: number;
  recordIssuesCapped: boolean;
}

export type PublishResult = PublishSuccess | SharedAppFailure;

/** The staged version as something the record scan can run against: this repository's collection,
 *  with the STAGED schema in place of the one on disk.
 *
 *  Validating the working tree's schema would answer the wrong question — the tree may have moved
 *  on since the deploy, and the version being promoted is the staged one. */
function stagedForValidation(
  staged: readonly StagedEntry[],
  collections: readonly LoadedCollection[],
): { ok: true; collections: LoadedCollection[] } | { ok: false; problems: string[] } {
  const byCid = new Map(collections.map((collection) => [collection.slug, collection]));
  const scanned: LoadedCollection[] = [];
  const problems: string[] = [];
  for (const entry of staged) {
    const collection = byCid.get(entry.cid);
    if (!collection) {
      // Fail closed rather than promote it unchecked: the records live in the app and would be
      // read under this schema by everyone, and nothing here can tell whether they still fit.
      problems.push(
        `'${entry.cid}' is staged but is not a collection in this repository any more, so its live records cannot be checked against the version about to be published. ` +
          "Run deploy again — it re-stages what the repository actually has and drops what it does not.",
      );
      continue;
    }
    scanned.push({ ...collection, schema: entry.doc.publishedSchema });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, collections: scanned };
}

/** The writes, in the order the design fixes: promote, project, then open. */
function publishSteps(handle: SharedAppHandle, aid: string, staged: readonly StagedEntry[], stamp: PublishStamp, face: ReturnType<typeof projectPublish>): WriteStep[] {
  return [
    ...staged.map(({ cid, doc }) => ({
      what: `the published schema for '${cid}' (apps/${aid}/collections/${cid})`,
      run: () => handle.docs.set(appSchemasPath(aid), cid, promoteSchema(doc, stamp)),
    })),
    {
      what: `the public config document (apps/${aid}/config/${PUBLIC_CONFIG_DOC})`,
      run: () => handle.docs.set(appConfigPath(aid), PUBLIC_CONFIG_DOC, face.config),
    },
    // The app document WITHOUT `public`: the promoted rule configuration lands with the schemas it
    // was staged beside, so the public write path is never judged by one version's constraints
    // against another's schema.
    { what: `the app document (apps/${aid})`, run: () => handle.docs.set(APPS_COLLECTION, aid, face.app) },
    // LAST, and only when the declaration asks for it. This is the authorization itself.
    ...(face.public === undefined
      ? []
      : [
          {
            what: `the public block on apps/${aid} — the authorization itself`,
            run: () => handle.docs.set(APPS_COLLECTION, aid, { ...face.app, public: face.public }),
          },
        ]),
  ];
}

export async function publishSharedApp(root: string, opts: SharedAppOptions = {}): Promise<PublishResult> {
  const context = await sharedAppContext(root);
  if (!context.ok) return context;
  const { authored, collections, handle } = context;
  const { aid } = authored;

  const staged = await readStaged(handle, aid);
  if (!staged.ok) return { ...staged, partial: false };
  if (staged.staged.length === 0) {
    return {
      ok: false,
      partial: false,
      problems: [
        `nothing is staged for apps/${aid}, so there is nothing to promote. Run deploy first — publish promotes what the roster reviewed at /staging/${aid} rather than reading the working tree.`,
      ],
    };
  }

  const toScan = stagedForValidation(staged.staged, collections);
  if (!toScan.ok) return { ...toScan, partial: false };
  const scan = await scanRecords(toScan.collections, root);
  const refusal = recordRefusal(scan, "publish", opts.confirm);
  if (refusal) return { ok: false, partial: false, problems: refusal };

  let existing: unknown;
  try {
    existing = await handle.docs.get(APPS_COLLECTION, aid);
  } catch (err) {
    return {
      ok: false,
      partial: false,
      problems: [
        `publish failed while reading the current app document (apps/${aid}): ${err instanceof Error ? err.message : String(err)}`,
        "Nothing was written. Publishing again is safe — this read carries `owner` forward and decides what a rollback would restore.",
      ],
    };
  }
  const stampSource = await (opts.resolveCommit ?? gitStamp)(root);
  const stamp: PublishStamp = {
    uid: handle.uid,
    email: handle.email,
    publishedAt: (opts.now ?? Date.now)(),
    commit: stampSource.commit,
    dirty: stampSource.dirty,
  };
  const face = projectPublish(authored, staged.staged, stamp, isRecord(existing) ? existing : null);

  const failure = await runWrites(publishSteps(handle, aid, staged.staged, stamp, face), "publish");
  if (failure) return failure;

  return {
    ok: true,
    aid,
    cids: staged.staged.map((entry) => entry.cid),
    publicOpen: face.public !== undefined,
    commit: stamp.commit,
    dirty: stampSource.dirty === true,
    recordIssues: scan.records,
    recordIssuesCapped: scan.capped,
  };
}
