// The fake Firestore the participate specs run against, and the app they publish into it.
//
// It lives here rather than in one spec because there are two — reads and writes — and neither can
// hold the harness for the other: `vi.mock` is hoisted per FILE, so a mock defined in one spec does
// not reach the next. What is shared instead is everything the mock is made OF, and the mutable bag
// it answers from, which each spec creates with `vi.hoisted` and passes in.
//
// WHAT THE FAKE IS FOR. It is not a Firestore emulator and does not try to be: what these specs
// check is the SHAPE of what this host sends — which pairs travel in one batch, which reads it makes
// before a write, which cap it puts in a query, whether a name reaches `where` as a literal key. So
// every operation is recorded as a line of text and the refusals are switched on by hand, because
// the refusals are the interesting half: a rules denial and a network failure are different answers
// this feature is required to keep apart.
import type { FirestoreDoc, FirestoreDocs } from "@mulmoclaude/core/collection/server";
import { appViewTierPath, viewConfigDocId } from "@receptron/sharedapp";

export const AID = "app-sakura";
export const ME = { uid: "uid-me", email: "me@example.com" };
/** The tool's own default, restated so an assertion says what it is checking. */
export const DEFAULT_ROWS = 50;
export const bookingsPath = `apps/${AID}/collections/bookings/items`;
export const slotsPath = `apps/${AID}/collections/slots/items`;

/** Everything the fake answers from, and everything it records.
 *
 *  One object rather than module-level variables, because each spec creates it inside `vi.hoisted`
 *  so that the mock factory — which is hoisted above the imports — has something real to close
 *  over. */
export interface Bag {
  /** Every operation a batch or transaction performed, in order — recorded on COMMIT, so a host
   *  that built a pair and never sent it fails rather than passes. */
  batched: string[];
  batchFails: boolean;
  /** How many commits refuse before the rest succeed — the rules saying no to one tier's attempt. */
  batchRefusals: number;
  /** How many commits FAIL without a permission code — a blip, which must not be read as a refusal. */
  batchBreaks: number;
  /** The row cap each query carried. */
  capped: number[];
  /** Collection paths whose query FAILS without a permission code — a blip, not a refusal. */
  breakQuery: Set<string>;
  /** Collection paths whose UNFILTERED query is refused — the shape a collection people submit to
   *  has for everyone but its staff. */
  denyQuery: Set<string>;
  /** What `getDocs` can see — filled from the same store the docs seam holds. */
  queryable: Map<string, { id: string; data: Record<string, unknown> }[]>;
  /** Live subscriptions the host has opened, in the order it opened them.
   *
   *  A watch is the one thing here that does not finish inside its own call, so the fake cannot
   *  answer it and be done: what the specs need is to hold the callbacks and FIRE them later, which
   *  is the only way to check that the first snapshot is not a change and that the last listener to
   *  die ends the watch. */
  listeners: Listener[];
  docs: Docs;
}

export interface Listener {
  /** The query or document reference the host subscribed to, as the fake described it. */
  target: { collectionPath?: string; path?: string; clause?: { field: string; value: unknown }; cap?: { rows: number } };
  /** Deliver a snapshot carrying `changes` changed documents. */
  fire: (changes: number) => void;
  /** Fail this listener the way Firestore does — asynchronously, after it was attached. */
  fail: (err: unknown) => void;
  stopped: boolean;
}

export const freshBag = (bag: Bag): void => {
  bag.batched.length = 0;
  bag.batchFails = false;
  bag.batchRefusals = 0;
  bag.batchBreaks = 0;
  bag.capped.length = 0;
  bag.breakQuery.clear();
  bag.denyQuery.clear();
  bag.queryable.clear();
  bag.listeners.length = 0;
  bag.docs = new Docs(bag);
};

export class Docs implements FirestoreDocs {
  constructor(private readonly bag: Bag) {}

  readonly store = new Map<string, Map<string, Record<string, unknown>>>();
  /** Which document paths refuse a GET — how a role scoped to one collection meets `apps/{aid}`. */
  denyGet = new Set<string>();
  /** Document paths whose GET fails WITHOUT a permission code — a blip, not a refusal. */
  breakGet = new Set<string>();
  created: { path: string; id: string; data: Record<string, unknown> }[] = [];

  put(collectionPath: string, id: string, data: Record<string, unknown>): void {
    const held = this.store.get(collectionPath) ?? new Map<string, Record<string, unknown>>();
    held.set(id, data);
    this.store.set(collectionPath, held);
    this.bag.queryable.set(
      collectionPath,
      [...held].map(([rowId, row]) => ({ id: rowId, data: row })),
    );
  }

  list = (collectionPath: string): Promise<FirestoreDoc[]> => {
    const held = this.store.get(collectionPath) ?? new Map();
    return Promise.resolve([...held].sort(([l], [r]) => (l < r ? -1 : 1)).map(([id, data]) => ({ id, data })));
  };

  get = (collectionPath: string, docId: string): Promise<unknown | null> => {
    if (this.breakGet.has(`${collectionPath}/${docId}`)) return Promise.reject(new Error("network"));
    if (this.denyGet.has(`${collectionPath}/${docId}`)) return Promise.reject(Object.assign(new Error("refused"), { code: "permission-denied" }));
    return Promise.resolve(this.store.get(collectionPath)?.get(docId) ?? null);
  };

  create = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<boolean> => {
    if (this.store.get(collectionPath)?.has(docId)) return Promise.resolve(false);
    this.created.push({ path: collectionPath, id: docId, data });
    this.put(collectionPath, docId, data);
    return Promise.resolve(true);
  };

  /** Document paths a plain `set` landed on. */
  sets: string[] = [];

  set = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<void> => {
    this.sets.push(`${collectionPath}/${docId}`);
    this.put(collectionPath, docId, data);
    return Promise.resolve();
  };
  delete = (): Promise<boolean> => Promise.resolve(true);
  watch = (): (() => void) => () => {};
}

/** The `firebase/firestore` surface this feature actually uses. */
/** The batch, whose whole job is to record what it was GIVEN and only on commit. */
const batchFor = (bag: Bag): Record<string, unknown> => {
  const ops: string[] = [];
  return {
    set: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`set ${ref.path} ${JSON.stringify(data)}`),
    // Both call shapes, because the two updates here are deliberately different: a record's declared
    // field goes through a FieldPath (a dotted name is a literal key, not a path), and the mirror's
    // `state` is ours and fixed.
    update: (ref: { path: string }, data: Record<string, unknown> | { segments: string[] }, value?: unknown) => {
      const asPath = data as { segments?: string[] };
      const written = Array.isArray(asPath.segments) ? { [asPath.segments.join(".")]: value } : data;
      ops.push(`update ${ref.path} ${JSON.stringify(written)}`);
    },
    delete: (ref: { path: string }) => ops.push(`delete ${ref.path}`),
    commit: () => {
      if (bag.batchBreaks > 0) {
        bag.batchBreaks -= 1;
        return Promise.reject(new Error("network"));
      }
      if (bag.batchRefusals > 0) {
        bag.batchRefusals -= 1;
        return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
      }
      if (bag.batchFails) return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
      bag.batched.push(...ops);
      return Promise.resolve();
    },
  };
};

/** A snapshot's changed documents, as the host reads them: only the COUNT is ever looked at, so
 *  these are shaped rather than real. A fake that handed back rows would let a change to this
 *  feature start reporting an app's data without a spec noticing. */
const shapedChanges = (changes: number): { index: number }[] => Array.from({ length: changes }, (_unused, index) => ({ index }));

/** The subscription seam. It REGISTERS rather than answers: nothing is delivered until a spec fires
 *  it, which is the only way "the first snapshot is not a change" can be checked at all. */
const subscribe = (bag: Bag) => (target: Record<string, unknown>, next: (snapshot: unknown) => void, error: (err: unknown) => void) => {
  const entry: Listener = {
    target: target as Listener["target"],
    fire: (changes) => {
      if (!entry.stopped) next({ docChanges: () => shapedChanges(changes) });
    },
    fail: (err) => {
      if (!entry.stopped) error(err);
    },
    stopped: false,
  };
  bag.listeners.push(entry);
  return () => {
    entry.stopped = true;
  };
};

export const firestoreMock = (bag: Bag): Record<string, unknown> => ({
  collection: (_db: unknown, collectionPath: string) => ({ collectionPath }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  // BOTH SHAPES THE REAL `doc` TAKES. `doc(collectionRef, id)` is what the write paths build; the
  // watch builds `doc(firestore, collectionPath, id)`, which is equally real and which a fake that
  // knew only the first would reject as a host error.
  doc: (first: { collectionPath?: string } | unknown, second: string, third?: string) =>
    third === undefined ? { path: `${(first as { collectionPath: string }).collectionPath}/${second}` } : { path: `${second}/${third}` },
  // The own-row query, recorded as a description rather than run: what matters is that the field
  // and the value came from the DECLARATION and the session, not from anything a caller passed.
  // Constraints arrive in whatever combination the caller built: a whole-collection read is a cap
  // alone, an own-row read is a `where` and a cap. Sorted out here rather than by position, so the
  // fake cannot quietly accept a query that forgot one.
  query: (source: { collectionPath: string }, ...constraints: ({ field: string; value: unknown } | { rows: number })[]) => {
    const clause = constraints.find((entry): entry is { field: string; value: unknown } => "field" in entry);
    const cap = constraints.find((entry): entry is { rows: number } => "rows" in entry);
    // A CAP IS REQUIRED OF A READ, NOT OF A QUERY. It used to be demanded here, which was the same
    // thing while `getDocs` was the only consumer — a subscription is the second, and it is
    // deliberately uncapped (see the note at the top of participate/watch.ts). Demanded at the read
    // instead, so the guard still catches the thing it was written for.
    if (cap !== undefined) bag.capped.push(cap.rows);
    return { ...source, clause, cap };
  },
  // The real `where` takes a FieldPath here, whose `segments` are the literal key. The fake reads
  // it the same way, so a host that went back to passing a bare string would query a nested path
  // and this file would notice.
  FieldPath: class {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  },
  where: (field: { segments: string[] }, _op: string, value: unknown) => ({ field: field.segments.join("."), value }),
  limit: (rows: number) => ({ rows }),
  onSnapshot: subscribe(bag),
  getDocs: (asked: { collectionPath: string; clause?: { field: string; value: unknown }; cap?: { rows: number } }) => {
    if (asked.cap === undefined) throw new Error("a read was issued with no row cap");
    const cap = asked.cap;
    // Refused only WITHOUT a where clause — which is the shape the rules actually take: listing a
    // collection people submit to is denied, while a query narrowed to the reader's own rows is
    // the one a participant's page issues and is allowed.
    if (bag.breakQuery.has(asked.collectionPath)) return Promise.reject(new Error("unavailable"));
    if (bag.denyQuery.has(asked.collectionPath) && asked.clause === undefined) {
      return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
    }
    const rows = bag.queryable.get(asked.collectionPath) ?? [];
    const clause = asked.clause;
    return Promise.resolve({
      docs: rows
        .filter((row) => clause === undefined || row.data[clause.field] === clause.value)
        // The fake honours the cap, so a host that stopped passing one would hand back more rows
        // than it asked for and the assertion would notice.
        .slice(0, cap.rows)
        .map((row) => ({ id: row.id, data: () => row.data })),
    });
  },
  // The transaction the mirrored create goes through. It is not a batch with a nicer name: the
  // `get` inside it is what the commit is re-run against, which is what makes claiming a slot
  // atomic. The fake answers it from the same store, so a host that stopped reading would claim a
  // slot somebody already holds and the test would notice.
  runTransaction: async (_db: unknown, body: (tx: unknown) => Promise<void>) => {
    const ops: string[] = [];
    const at = (path: string): { collectionPath: string; id: string } => {
      const cut = path.lastIndexOf("/");
      return { collectionPath: path.slice(0, cut), id: path.slice(cut + 1) };
    };
    await body({
      get: (ref: { path: string }) => {
        const { collectionPath, id } = at(ref.path);
        const held = bag.docs.store.get(collectionPath)?.has(id) === true;
        return Promise.resolve({ exists: () => held });
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`set ${ref.path} ${JSON.stringify(data)}`),
      update: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`update ${ref.path} ${JSON.stringify(data)}`),
      delete: (ref: { path: string }) => ops.push(`delete ${ref.path}`),
    });
    if (bag.batchFails) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    bag.batched.push(...ops);
  },
  writeBatch: () => batchFor(bag),
});

const submitBlock = {
  auth: "verifiedEmail",
  emailField: "requesterEmail",
  createFields: ["requesterEmail", "slot", "status", "guests", "seat"],
  initialStatus: "booked",
  idFrom: "field",
  idField: "slot",
  mirror: "slots",
  selfTransitions: { booked: ["cancelled"] },
  selfDelete: ["booked"],
};

/** Publish this app into the fake database. Nothing here is read off disk — that is the point. */
/** The submit declaration this app publishes, in whichever of its shapes a test needs. */
export function submitFor({
  mirror,
  idFromUid,
  bothIdentities,
  dottedEmailField,
}: {
  mirror: boolean;
  idFromUid: boolean;
  bothIdentities: boolean;
  dottedEmailField: boolean;
}): Record<string, unknown> {
  return {
    ...submitBlock,
    ...(mirror ? {} : { mirror: undefined }),
    // The reader's row is NAMED rather than queried: its id IS their uid.
    ...(idFromUid ? { idFrom: "auth.uid", idField: undefined, emailField: undefined, mirror: undefined } : {}),
    // Both identities, either of which the rules accept as an own row.
    ...(bothIdentities ? { uidField: "uid" } : {}),
    // An ordinary top-level key that happens to contain a dot.
    ...(dottedEmailField ? { emailField: "requester.email" } : {}),
  };
}

/** `config/public` as this app publishes it — the declaration, the drawn form, and the roster
 *  tier's own writes, which this document carries whether or not the app publishes any page. */
/** The `seat` choices, in whichever of their three shapes a test needs. */
const enumValues = (over: { longEnum: boolean; hugeEnum: boolean }): string[] => {
  if (over.hugeEnum) return ["z".repeat(20_000), "aisle"];
  if (over.longEnum) return ["w".repeat(2_000), "aisle"];
  return ["window", "aisle"];
};

const publicConfig = (over: {
  name: string;
  enabled: boolean;
  mirror: boolean;
  idFromUid: boolean;
  bothIdentities: boolean;
  dottedEmailField: boolean;
  longEnum: boolean;
  hugeEnum: boolean;
}): Record<string, unknown> => ({
  protocol: "1.0.0",
  name: over.name,
  enabled: over.enabled,
  read: ["slots"],
  submit: { bookings: submitFor(over) },
  form: {
    bookings: {
      fields: {
        requesterEmail: { label: "Email", type: "email" },
        slot: { label: "Slot", type: "string", required: true },
        status: { label: "Status", type: "string" },
        // The two types publish deliberately allows, and that a string-only tool was accused of
        // making unsubmittable.
        guests: { label: "Guests", type: "number" },
        seat: { label: "Seat", type: "enum", values: enumValues(over) },
      },
      statusField: "status",
    },
  },
  write: [{ cid: "bookings", statusField: "status", transitions: { booked: ["cancelled"] }, selfDelete: ["booked"], withdrawMirror: "slots" }],
  publishedAt: 1,
});

/** The app document's own `public` block: mirroring the projection by default, absent when the test
 *  asks for none, and its own thing when the test is about the two disagreeing. */
const appPublicBlock = (given: Record<string, unknown> | null | undefined, enabled: boolean): Record<string, unknown> => {
  if (given === null) return {};
  if (given === undefined) return { public: { enabled, read: ["slots"] } };
  return { public: given };
};

export function publishApp(
  bag: Bag,
  {
    memberTier = true,
    roles = { "*": "editor" } as Record<string, string> | null,
    writers = [ME.email],
    rosterTier = false,
    mirror = true,
    idFromUid = false,
    enabled = true,
    bothIdentities = false,
    name = "Sakura Hair",
    dottedEmailField = false,
    dottedStatusField = false,
    /** An enum choice longer than the display cap — legal, and the rules compare it exactly. */
    longEnum = false,
    /** An enum choice larger than a whole list's budget: omitted, never cut. */
    hugeEnum = false,
    /** The app document's own `public` block: undefined mirrors `enabled`, null omits it, an object
     *  sets it apart from the projection — the shape a half-finished publish leaves. */
    appPublic = undefined as Record<string, unknown> | null | undefined,
  } = {},
): void {
  bag.docs.put("appSlugs", "sakura", { aid: AID, published: true });
  if (roles !== null)
    bag.docs.put("apps", AID, {
      aid: AID,
      name,
      members: { [ME.email]: roles },
      memberEmails: [ME.email],
      // The block the RULES read for anonymous access. Carried here as well as in `config/public`
      // because publish writes the two separately and a run can stop between them.
      ...appPublicBlock(appPublic, enabled),
    });
  bag.docs.put(`apps/${AID}/config`, "public", publicConfig({ name, enabled, mirror, idFromUid, bothIdentities, dottedEmailField, longEnum, hugeEnum }));
  if (rosterTier)
    // A participant page's own projection, left behind by an EARLIER publish: it names the same
    // collection as `config/public` and carries only the transition half. `runWrites` can stop
    // after any step and `config/public` is written before the tier documents, so this pair is a
    // real state — and dropping either half of it takes away a move the deployed rules allow.
    bag.docs.put(appViewTierPath(AID, "roster"), viewConfigDocId(), {
      protocol: "1.0.0",
      views: [{ id: "mine", collections: [{ cid: "bookings", scope: "own" }] }],
      submit: {},
      write: [{ cid: "bookings", statusField: "status", transitions: { booked: ["cancelled"] } }],
      publishedAt: 1,
    });
  if (memberTier)
    // The tier's own id, taken from the package rather than spelled here: it carries a `live:`
    // prefix, and a document written at "config" is a document nothing reads.
    bag.docs.put(appViewTierPath(AID, "member"), viewConfigDocId(), {
      protocol: "1.0.0",
      views: [{ id: "desk", collections: [{ cid: "bookings", scope: "all" }] }],
      submit: {},
      write: [
        {
          cid: "bookings",
          statusField: dottedStatusField ? "workflow.state" : "status",
          transitions: { booked: ["approved", "cancelled"] },
          assigneeField: "handledBy",
          writers,
          rowWriters: [],
          mail: { toField: "requesterEmail", on: { approved: { from: ["booked"], to: "approved" } } },
        },
      ],
      publishedAt: 1,
    });
}
