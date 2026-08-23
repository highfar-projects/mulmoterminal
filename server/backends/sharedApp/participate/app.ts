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
import { collection, getDocs, limit as limitTo, query, where } from "firebase/firestore";
import {
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
import type { SharedAppHandle } from "../context.js";

/** The tiers, widest first. An intent is offered to each in turn and the first that carries it
 *  wins — see `judgeTiers` in `intent.ts` for why that is not a permission decision. */
export const TIERS: readonly WriteTier[] = ["member", "roster"];

export interface JoinedApp {
  slug: string;
  aid: string;
  /** The app's own name, when the roster let us read the app document. */
  name?: string;
  /** Is the URL name resolving for the world? A roster-only app answers false and still works for
   *  the people on it — the reservation resolves for them either way (`appSlugs` read). */
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

const NO_SESSION =
  "this needs a signed-in session: connect remote-host first. A shared app answers to `request.auth` and nothing else — " +
  "everything here is read and written as YOU, which is the whole point of this tool.";

/** Read a document, or null for any reason at all.
 *
 *  A refusal and an absent document are collapsed ON PURPOSE here, and only here: every one of
 *  these reads is optional, and the caller's next line is the same either way — the projection is
 *  not available, so say what is available instead. Where the difference matters (a record the
 *  reader is about to act on) it is kept: see `readRecord`. */
const readDoc = async (handle: SharedAppHandle, path: string, id: string): Promise<Record<string, unknown> | null> => {
  const found = await handle.docs.get(path, id).catch(() => null);
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

/** Merge two projections of the same tier by cid, first wins.
 *
 *  The roster tier has two sources — its own `config` document and the public form's `write` — and
 *  they are the same publish's answer about different collections: the tier config covers what the
 *  participant PAGES draw, the public config covers what a submission may do to its own row. An app
 *  can have both, and neither is a subset of the other. */
const mergeByCid = (first: ProjectedViewWrite[], second: ProjectedViewWrite[]): ProjectedViewWrite[] => {
  const seen = new Set(first.map((entry) => entry.cid));
  return [...first, ...second.filter((entry) => !seen.has(entry.cid))];
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
      published: reservation.published === true,
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
export type RecordScope = "all" | "own" | "none";

export interface ReadRecords {
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
function ownSelector(app: JoinedApp, cid: string): { field: string; value: string } | { id: string } | "unlistable" | null {
  const raw = submitBlockOf(app, cid);
  if (raw === null) return null;
  const handle = app.handle;
  if (typeof raw.uidField === "string") return { field: raw.uidField, value: handle.uid };
  if (typeof raw.emailField === "string") return { field: raw.emailField, value: handle.email };
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
  // THE WHOLE-COLLECTION READ IS UNCAPPED AT THE SEAM, and the slice below is all this host can do
  // about it: `FirestoreDocs.list` in `@mulmoclaude/core` takes a path and nothing else. Adding a
  // limit there is a change to an interface two hosts implement and every collection backend
  // consumes, which is not this feature's to make — and the own-row path below, which is the one a
  // participant actually takes, does cap in the query. Said out loud rather than left to be
  // discovered: a member reading a big collection pays for all of it.
  const listed = await app.handle.docs
    .list(path)
    .then((docs) => docs.map((entry) => ({ ...(isRecord(entry.data) ? entry.data : {}), id: entry.id })))
    .catch(() => null);
  if (listed !== null) return { scope: "all", rows: listed.slice(0, limit) };

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
    const found = await app.handle.docs.get(path, want.id).catch(() => null);
    return { scope: "own", rows: isRecord(found) ? [{ ...found, id: want.id }] : [], note: "only your own row is readable here" };
  }
  const db = currentFirestore();
  // THE CAP IS IN THE QUERY, not applied afterwards: Firestore bills and transfers what the query
  // matched, so slicing a fetched result costs the whole collection to show a page of it.
  const asked = query(collection(db, path), where(want.field, "==", want.value), limitTo(limit));
  const snapshot = await getDocs(asked).catch(() => null);
  if (snapshot === null) return { scope: "none", rows: [], note: "neither the collection nor your own rows in it could be read" };
  return {
    scope: "own",
    rows: snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })),
    note: "only your own rows are readable here",
  };
}

/** One record, with a REFUSAL kept apart from an absence.
 *
 *  Both are "no row" to a reader and they send an agent to opposite places: absent means the id is
 *  wrong or the row is gone, refused means the row may well be there and is not yours to see. An
 *  intent judged against a row nobody could read would be judged against nothing. */
export async function readRecord(app: JoinedApp, cid: string, id: string): Promise<{ read: true; row: Record<string, unknown> | null } | { read: false }> {
  try {
    const found = await app.handle.docs.get(itemsPath(app.aid, cid), id);
    return { read: true, row: isRecord(found) ? { ...found, id } : null };
  } catch {
    return { read: false };
  }
}
