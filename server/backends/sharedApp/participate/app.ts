// A published shared app, read as one of the people it is FOR.
//
// Everything else under `sharedApp/` reads the repository — `app.json`, the schemas beside it, the
// pages in it — because everything else is an operation the AUTHOR performs. This side has no
// repository. It resolves a URL name to an app and reads what publish left in Firestore, which is
// the same thing mulmoserver's `/a/`, `/m/` and `/p/` pages read and the only thing a person who
// was handed a link has.
//
// WHERE CAPABILITY COMES FROM, and it is the decision this file exists to hold. `capabilityOf`
// answers from a `ProjectedViewWrite` — the projection of one TIER of one publish. There are two
// places publish leaves one:
//
//   apps/{aid}/member/live:config   the staff tier's writes  (readable by anyone holding a role)
//   apps/{aid}/roster/live:config   the participant tier's   (readable by anyone on the roster)
//   apps/{aid}/config/public        the public form's writes (readable by the world)
//
// The `live:` on the first two is not a typo and not decoration: it is `viewDocId`'s prefix, which
// is why both are addressed through `viewConfigDocId()` below rather than spelled here. A document
// written or looked for at plain `config` is a document nothing reads.
//
// The first two exist only when the app published PAGES for that tier; the third is written
// whenever the declaration opens a collection for submission, pages or no pages. So an app with no
// staff page tells us nothing about what its staff may do — and the honest answer there is to say
// so, not to reconstruct the declaration from `apps/{aid}` and judge from that. Reconstruction was
// the first design and it is wrong twice over: the published `public.submit` has had its window
// lowered to millis and no longer parses as an authored declaration, and `apps/{aid}` is
// `readerOf(a, '*')` — a stylist holding only `{bookings: "editor"}` cannot read it at all, which
// is exactly the reader who would need it most.
//
// So this host judges against precisely the projection production judges against, and where there
// is none it says there is none.
import { collection, FieldPath, getDocs, limit as limitTo, query, where, type Firestore } from "firebase/firestore";
import {
  APP_PROTOCOL,
  protocolOf,
  APP_SLUGS_COLLECTION,
  APPS_COLLECTION,
  PUBLIC_CONFIG_DOC,
  appConfigPath,
  appViewTierPath,
  viewConfigDocId,
  type ProjectedViewWrite,
} from "@receptron/sharedapp";
import { capabilitiesFor, projectedWritesOf, type ViewCapability, type WriteTier } from "@receptron/sharedapp/view";
import { firestoreHandle } from "@mulmoclaude/core/collection/server";
import { isRecord } from "../../../../common/isRecord.js";
import { currentFirestore } from "../../remoteHost/session.js";
import { itemsPath } from "../itemWrites.js";
import { refused } from "../refused.js";
import type { SharedAppHandle } from "../context.js";

/** The tiers, widest first. An intent is offered to each in turn and the first that carries it
 *  wins — see `judgeTiers` in `intent.ts` for why that is not a permission decision. */
export const TIERS: readonly WriteTier[] = ["member", "roster"];

export interface JoinedApp {
  slug: string;
  aid: string;
  /** The app's own name, when the roster let us read the app document. */
  name?: string;
  /** Is this app OPEN to anyone with the link?
   *
   *  Read from `config/public.enabled`, which is what the rules read (`publicOn`), and NOT from the
   *  slug reservation's `published`. Publish sets that flag from whether a `public` block EXISTS
   *  (`setSlugPublished(…, face.public !== undefined)`), so an app that deliberately publishes one
   *  with `enabled: false` — the member-only append feed among the shipped templates — carries a
   *  reservation saying published while anonymous reads stay closed. Reporting that as open tells
   *  somebody their roster-only board is on the internet.
   *
   *  The reservation is the fallback for the app whose `config/public` is not there to read, where
   *  its own answer is the only one available. */
  published: boolean;
  /** `config/public`, when the app publishes a public face — the submit declarations and the form
   *  live here.
   *
   *  Held as a plain document rather than as `PublishedConfigDoc`, which would be an assertion
   *  about a document this reader did not write: it comes off somebody else's app, published by a
   *  version of the projection this build may not be the same as. Read key by key instead — the
   *  three readers below are the only things that reach into it. */
  config: Record<string, unknown> | null;
  /** The projected writes per tier, and the document they came from. An absent tier is "this app
   *  published no projection for it", which is different from "you may do nothing". */
  writes: Partial<Record<WriteTier, ProjectedViewWrite[]>>;
  /** The roles the app document lists for this reader, when it was readable. Absent means the
   *  document was denied — the ordinary state for a collection-scoped role. */
  roles?: Record<string, string>;
  handle: SharedAppHandle;
}

export type JoinedAppResult = { ok: true; app: JoinedApp } | { ok: false; problems: string[] };

/** MAY THIS BUILD READ THIS DOCUMENT AT ALL?
 *
 *  Every published document carries the version of the contract it was written against, and the
 *  MAJOR is the load-bearing half: at a higher one an existing key's MEANING has moved, so a reader
 *  that goes ahead does not fail — it acts on a document it has misunderstood. This is the same gate
 *  mulmoserver puts in front of `/m/` and `/p/` (`protocolDrawable`), and it answers the same three
 *  ways:
 *
 *    ABSENT is 1.0.0. Every app published before the key existed carries nothing, and those are the
 *    documents in Firestore right now. That is not a lenient default; it is what they are.
 *
 *    UNREADABLE is refused. A version that does not parse is most likely written by something NEWER
 *    than this, and guessing low is the direction every decision then goes wrong quietly — which is
 *    why `protocolOf` answers null rather than a version.
 *
 *    A HIGHER MAJOR is refused. Not narrowed, not half-read: the app is refused whole, because a
 *    tool that reported some of what a person may do and silently dropped the rest is worse than one
 *    that says it is too old. */
const readable = (doc: Record<string, unknown> | null): boolean => {
  const stated = doc?.protocol;
  if (stated === undefined) return true;
  if (typeof stated !== "string") return false;
  const version = protocolOf(stated);
  const mine = protocolOf(APP_PROTOCOL);
  return version !== null && mine !== null && version.major <= mine.major;
};

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const NO_SESSION =
  "this needs a signed-in session: connect remote-host first. A shared app answers to `request.auth` and nothing else — " +
  "everything here is read and written as YOU, which is the whole point of this tool.";

/** Read a document: the document, or null for absent-or-refused.
 *
 *  A refusal and an absent document are collapsed ON PURPOSE, and only those two: every one of
 *  these reads is optional, and the caller's next line is the same either way — the projection is
 *  not available, so say what IS available instead.
 *
 *  A TRANSIENT FAILURE IS NOT ONE OF THEM and is rethrown. Read as "not available", a blip on the
 *  member tier lets `joinApp` answer from the roster projection alone: a capability list missing
 *  the staff half, reported in the same words as an app that genuinely published no staff page.
 *  The caller then acts on it — and there is nothing anywhere in the answer to say a read broke. */
const readDoc = async (handle: SharedAppHandle, path: string, id: string): Promise<Record<string, unknown> | null> => {
  const found = await handle.docs.get(path, id).catch((err: unknown) => {
    if (refused(err)) return null;
    throw err;
  });
  return isRecord(found) ? found : null;
};

/** A tier's writable half, read with the PACKAGE's own reader.
 *
 *  `projectedWritesOf` is what mulmoserver runs over the same document, and it drops an entry it
 *  cannot read whole rather than passing a half-parsed one down — a `transitions` that is not a
 *  table, a `statusField` with no table beside it. A shallow filter here would be a second reading
 *  of a document written by somebody else's publish, and the two could disagree about what a page
 *  may do.
 *
 *  The null is this host's: `projectedWritesOf` answers `[]` both for "the document says nothing is
 *  writable" and for "there is no document", and those are different answers here. A tier with no
 *  projection published says NOTHING about what this reader may do, and reporting it as a refusal
 *  would name a missing document as if it were a denial. */
const writesOf = (doc: Record<string, unknown> | null): ProjectedViewWrite[] | null => (doc === null ? null : projectedWritesOf(doc));

/** Merge the roster tier's two sources, KEY BY KEY rather than entry by entry.
 *
 *  The tier has two: its own `config` document, covering what the participant PAGES draw, and the
 *  public form's `write`, covering what a submitter may do to their own row. An app can have both,
 *  and neither is a subset of the other.
 *
 *  Dropping a whole entry because the other source names the same cid was the first shape and it
 *  was wrong. In one publish the two are identical for a shared cid — `transitionPart`,
 *  `assignPart` and `withdrawPart` in `appViews.ts` do not branch between `participant` and
 *  `public` at all — so it cost nothing in the ordinary case and everything in the one that
 *  matters: `runWrites` can stop after ANY step (principle 8), and `config/public` is written
 *  BEFORE the tier documents (`publish.ts`), so a half-finished run leaves a tier entry from this
 *  publish beside a public entry from the last one. Dropping the public half there loses a
 *  `selfDelete` or a `withdrawMirror` the deployed rules would have honoured, and the tool refuses
 *  a withdrawal its own app allows.
 *
 *  The tier entry wins where both define a key, for the same reason: it is the LATER write of the
 *  two, so where they disagree it is the one that describes this publish. */
const mergeByCid = (fromTier: ProjectedViewWrite[], fromPublic: ProjectedViewWrite[]): ProjectedViewWrite[] => {
  const byCid = new Map(fromTier.map((entry) => [entry.cid, entry]));
  for (const entry of fromPublic) {
    const held = byCid.get(entry.cid);
    byCid.set(entry.cid, held === undefined ? entry : { ...entry, ...held });
  }
  return [...byCid.values()];
};

/** The roster tier's writes, from the two documents that can carry them. Null when neither did. */
function rosterTier(fromTier: ProjectedViewWrite[] | null, fromPublic: ProjectedViewWrite[] | null): ProjectedViewWrite[] | null {
  if (fromTier === null) return fromPublic;
  if (fromPublic === null) return fromTier;
  return mergeByCid(fromTier, fromPublic);
}

/** Resolve a URL name to everything this reader can learn about the app behind it. */
export async function joinApp(slug: string): Promise<JoinedAppResult> {
  const handle = firestoreHandle();
  if (!handle) return { ok: false, problems: [NO_SESSION] };
  try {
    return await readApp(handle, slug);
  } catch (err) {
    // A read that BROKE, as opposed to one the rules refused — the refusals are already null above.
    // Reported rather than absorbed: every absorbed one narrows this answer silently.
    return {
      ok: false,
      problems: [
        `"${slug}" could not be read: ${messageOf(err)}. That is a failure, not a permission boundary — nothing was written, and this says nothing about what you may do.`,
      ],
    };
  }
}

async function readApp(handle: SharedAppHandle, slug: string): Promise<JoinedAppResult> {
  // `appSlugs/{slug}` is `published == true || listedIn(slugApp())`, so this read failing is a real
  // answer: either the name does not exist, or it names an unpublished app you are not on the
  // roster of. Both are "not yours to open", and neither is worth two sentences.
  const reservation = await readDoc(handle, APP_SLUGS_COLLECTION, slug);
  if (reservation === null || typeof reservation.aid !== "string") {
    return {
      ok: false,
      problems: [
        `No shared app answers to "${slug}". Either the URL name is wrong, or the app has not been published and you are not on its roster — ` +
          "an unpublished app's name resolves only for its members.",
      ],
    };
  }
  const aid = reservation.aid;

  const [appDoc, publicConfig, memberConfig, rosterConfig] = await Promise.all([
    readDoc(handle, APPS_COLLECTION, aid),
    readDoc(handle, appConfigPath(aid), PUBLIC_CONFIG_DOC),
    readDoc(handle, appViewTierPath(aid, "member"), viewConfigDocId()),
    readDoc(handle, appViewTierPath(aid, "roster"), viewConfigDocId()),
  ]);

  // THE WHOLE APP, not the document that happens to be too new. A reader that dropped one
  // projection and kept the others would report a capability list missing the half it could not
  // read, with nothing anywhere saying so.
  if (![publicConfig, memberConfig, rosterConfig].every(readable))
    return {
      ok: false,
      problems: [
        `"${slug}" was published against a newer version of the shared-app contract than this build understands. ` +
          "Reading it here would mean acting on a document whose keys may no longer mean what this build thinks — so it is refused whole rather than read in part. Update MulmoTerminal.",
      ],
    };

  const roles = rolesOf(appDoc, handle.email);
  const memberWrites = writesOf(memberConfig);
  const rosterWrites = writesOf(rosterConfig);
  const publicWrites = writesOf(publicConfig);
  const roster = rosterTier(rosterWrites, publicWrites);

  return {
    ok: true,
    app: {
      slug,
      aid,
      published: typeof publicConfig?.enabled === "boolean" ? publicConfig.enabled : reservation.published === true,
      config: publicConfig,
      writes: {
        ...(memberWrites === null ? {} : { member: memberWrites }),
        ...(roster === null ? {} : { roster }),
      },
      ...(typeof appDoc?.name === "string" ? { name: appDoc.name } : {}),
      ...(roles === null ? {} : { roles }),
      handle,
    },
  };
}

/** This reader's own row of the roster, when the app document was readable.
 *
 *  Case-folded on the way in, matching `rosterCaseProblems`: the rules compare `email()` to the
 *  keys, and an app that got that wrong is refused at publish rather than here. */
function rolesOf(appDoc: Record<string, unknown> | null, email: string): Record<string, string> | null {
  if (appDoc === null || !isRecord(appDoc.members)) return null;
  const mine = appDoc.members[email.toLowerCase()] ?? appDoc.members[email];
  if (!isRecord(mine)) return null;
  return Object.fromEntries(Object.entries(mine).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** The submit declaration `config/public` publishes for one collection, or null.
 *
 *  The one door into that document, so the loose typing above is read in exactly one place. */
export const submitBlockOf = (app: JoinedApp, cid: string): Record<string, unknown> | null => {
  const submit = app.config?.submit;
  if (!isRecord(submit)) return null;
  const block = submit[cid];
  return isRecord(block) ? block : null;
};

/** The drawn form `config/public` publishes for one collection — MulmoTerminal's own addition to
 *  that document, and what makes a submission possible without the repository. */
export const formBlockOf = (app: JoinedApp, cid: string): Record<string, unknown> | null => {
  const form = app.config?.form;
  if (!isRecord(form)) return null;
  const drawn = form[cid];
  return isRecord(drawn) ? drawn : null;
};

/** The collections this app takes submissions for. */
export const submitCids = (app: JoinedApp): string[] => (isRecord(app.config?.submit) ? Object.keys(app.config.submit) : []);

/** The collections `public.read` opens to the world. */
export const worldReadable = (app: JoinedApp): string[] =>
  Array.isArray(app.config?.read) ? app.config.read.filter((cid): cid is string => typeof cid === "string") : [];

/** What this reader may change, per collection, on one tier. */
export const capabilitiesOn = (app: JoinedApp, tier: WriteTier): Record<string, ViewCapability> =>
  capabilitiesFor(app.writes[tier] ?? [], app.handle.email, tier);

/** How a set of records was obtained — reported with them, because the two answers mean different
 *  things and an agent told neither will describe an own-row list as the whole collection. */
export type RecordScope = "all" | "own" | "none" | "failed";

export interface ReadRecords {
  /** `all` the collection, `own` the reader's rows, `none` nothing the rules would open — and
   *  `failed`, which is NOT one of those. A read that broke says so as itself: narrowed silently it
   *  reads as a boundary the rules drew, and the caller then describes a partial answer as the
   *  whole of what they are allowed. */
  scope: RecordScope;
  rows: Record<string, unknown>[];
  /** Why the scope is what it is, in one clause, or undefined when `all` succeeded. */
  note?: string;
}

/** The own-row selector this collection declares, out of the PUBLISHED submit block.
 *
 *  These are the same three the rules identify an own row by (`ownRow`), asked in the only terms a
 *  client has. `auth.uid+field` is deliberately absent: its rows are named, never listed — the
 *  rules grant a submitter the document they can NAME rather than a range of them — so a query
 *  cannot be built and pretending otherwise would return an empty list that reads as "you have
 *  nothing here". */
function ownSelector(app: JoinedApp, cid: string): { fields: { field: string; value: string }[] } | { id: string } | "unlistable" | null {
  const raw = submitBlockOf(app, cid);
  if (raw === null) return null;
  const handle = app.handle;
  // BOTH, when the declaration carries both. `ownRow` in the rules accepts EITHER identity, so a
  // row staff entered on somebody's behalf can hold the address and no uid while that person's own
  // submissions hold the uid — and querying one field only would hide half of what is theirs, as an
  // empty answer rather than as an error.
  const fields = [
    ...(typeof raw.uidField === "string" ? [{ field: raw.uidField, value: handle.uid }] : []),
    ...(typeof raw.emailField === "string" ? [{ field: raw.emailField, value: handle.email }] : []),
  ];
  if (fields.length > 0) return { fields };
  if (raw.idFrom === "auth.uid") return { id: handle.uid };
  if (raw.idFrom === "auth.uid+field") return "unlistable";
  return null;
}

/** One collection's records, read as this reader.
 *
 *  THE WHOLE LIST IS TRIED FIRST, and its refusal is not an error: `itemRead` opens a collection to
 *  the roster, to `public.read`, or to nobody, and a participant reading a collection people submit
 *  to is refused by design — one visitor listing every other visitor's answer is the thing that
 *  rule exists to prevent. So a denial falls through to the reader's OWN rows, which is what a
 *  participant's page is handed, and the scope is reported either way. */
export async function readRecords(app: JoinedApp, cid: string, limit: number): Promise<ReadRecords> {
  const path = itemsPath(app.aid, cid);
  const db = currentFirestore();
  // NOT `handle.docs.list`, and the reason is the cap. That seam takes a path and nothing else
  // (`FirestoreDocs` in `@mulmoclaude/core`), so every row of the collection would be billed,
  // transferred and held in memory in order to show a page of it — and adding a limit THERE is a
  // change to an interface two hosts implement and every collection backend consumes. Issuing the
  // query here costs nothing and bounds the read at the source, which is where a cap has to be.
  //
  // The ORDER is the seam's: `list` sorts by document id, and a query with no `orderBy` is ordered
  // by `__name__` too, so the same page comes back. Ordering by a record field would silently drop
  // the documents that lack it.
  const listed = await getDocs(query(collection(db, path), limitTo(limit)))
    .then((snapshot) => ({ ok: true as const, rows: snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })) }))
    // ONLY A REFUSAL NARROWS. Anything else is reported as itself: the own-row fallback below is the
    // right answer for a reader the rules will never open this collection to, and the wrong one for
    // a reader whose next attempt would have succeeded — they would be told their own rows are all
    // they may see.
    .catch((err: unknown) => ({ ok: false as const, refusal: refused(err), why: messageOf(err) }));
  if (listed.ok) return { scope: "all", rows: listed.rows };
  if (!listed.refusal) return { scope: "failed", rows: [], note: listed.why };

  const want = ownSelector(app, cid);
  if (want === null)
    return {
      scope: "none",
      rows: [],
      note: "the whole collection is not readable by you, and its declaration names no field an own-row query could be built from",
    };
  if (want === "unlistable")
    return {
      scope: "none",
      rows: [],
      note:
        "this collection builds its ids as `uid_<field>`, and the rules grant a submitter the document they can NAME rather than a range of them — " +
        "so your rows cannot be listed at all. Name the record directly if you know which one it is",
    };
  if ("id" in want) {
    // SAME DISTINCTION AS EVERY OTHER READ HERE. An empty answer means "you have not got one",
    // which is a real and actionable thing to be told; a blip reported that way is the same
    // sentence about a row that may well exist.
    const own = await app.handle.docs
      .get(path, want.id)
      .then((found) => ({ ok: true as const, found }))
      .catch((err: unknown) => ({ ok: false as const, refusal: refused(err), why: messageOf(err) }));
    if (!own.ok && !own.refusal) return { scope: "failed", rows: [], note: own.why };
    const found = own.ok ? own.found : null;
    return { scope: "own", rows: isRecord(found) ? [{ ...found, id: want.id }] : [], note: "only your own row is readable here" };
  }
  return ownRowsBy(db, path, want.fields, limit);
}

/** The reader's own rows, by every identity the declaration names.
 *
 *  ONE QUERY PER IDENTITY, each capped in the QUERY for the same reason the collection read is:
 *  Firestore bills what the query matched. It cannot ask for "either field equals mine" in one go
 *  without an `or`, and the two answers are disjoint sets of documents anyway — merged by id here,
 *  so a row that somehow carried both is not shown twice. */
async function ownRowsBy(db: Firestore, path: string, fields: { field: string; value: string }[], limit: number): Promise<ReadRecords> {
  const answers = await Promise.all(
    fields.map((field) =>
      // `new FieldPath(name)` rather than the bare string, and this is not defensive dressing: a
      // dotted string is a NESTED PATH to `where`, so a declaration whose `emailField` is
      // `requester.email` — a perfectly ordinary top-level key, which the rules and every
      // submission treat literally — would be queried as `email` inside a map called `requester`
      // and match nothing. An empty answer, not an error.
      getDocs(query(collection(db, path), where(new FieldPath(field.field), "==", field.value), limitTo(limit)))
        .then((found) => ({ ok: true as const, found }))
        .catch((err: unknown) => ({ ok: false as const, refusal: refused(err), why: messageOf(err) })),
    ),
  );
  const broke = answers.find((answer) => !answer.ok && !answer.refusal);
  if (broke !== undefined && !broke.ok) return { scope: "failed", rows: [], note: broke.why };
  if (answers.every((answer) => !answer.ok)) return { scope: "none", rows: [], note: "neither the collection nor your own rows in it could be read" };
  const byId = new Map<string, Record<string, unknown>>();
  for (const answer of answers) {
    if (!answer.ok) continue;
    for (const entry of answer.found.docs) byId.set(entry.id, { ...entry.data(), id: entry.id });
  }
  return { scope: "own", rows: [...byId.values()].slice(0, limit), note: "only your own rows are readable here" };
}

/** One record, with THREE answers where a reader sees one.
 *
 *  Absent, refused and failed all look like "no row" and send an agent to opposite places: absent
 *  means the id is wrong or the row is gone, refused means the row may well be there and is not
 *  yours to see, and failed means nobody knows — try again. An intent judged against a row nobody
 *  could read would be judged against nothing, and told the wrong reason for it the caller stops
 *  asking. */
export type ReadRecord = { read: true; row: Record<string, unknown> | null } | { read: false; refusal: boolean; why: string };

export async function readRecord(app: JoinedApp, cid: string, id: string): Promise<ReadRecord> {
  try {
    const found = await app.handle.docs.get(itemsPath(app.aid, cid), id);
    return { read: true, row: isRecord(found) ? { ...found, id } : null };
  } catch (err) {
    return { read: false, refusal: refused(err), why: messageOf(err) };
  }
}
