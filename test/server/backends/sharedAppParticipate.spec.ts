// @vitest-environment node
//
// TAKING PART in an app somebody else published.
//
// The property under test is not the one `sharedAppPreviewIntent.spec.ts` pins. There the author is
// the app's OWNER and the host must not be looser than production; here every read and write goes
// out as the signed-in reader, so the deployed rules answer for exactly the right person and the
// host's judgement buys a NAMED refusal rather than a permission.
//
// So what these tests hold is the other half:
//
//   - the declaration is read back off FIRESTORE, with no repository involved at all — an app this
//     machine has never held is fully usable from its published documents
//   - the pairs the rules read with `getAfter()` go out in one batch, spelled as mulmoserver spells
//     them (the mail id especially: `{cid}_{itemId}_{template}` is rebuilt by the rules, and a
//     divergence queues a document nothing can send)
//   - a submission is reported as a record written and never as a place held (principle 3 — the
//     rules cannot count rows, so capacity is derived from order and this tool must not claim one)
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { appViewTierPath, viewConfigDocId } from "@receptron/sharedapp";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDoc, type FirestoreDocs } from "@mulmoclaude/core/collection/server";
import { useSharedApp } from "../../../server/infra/use-shared-app-tool.js";
import { makeTempDir } from "../../support/tempDir";

const AID = "app-sakura";
/** The tool's own default, restated so the assertion below says what it is checking. */
const DEFAULT_ROWS = 50;
const ME = { uid: "uid-me", email: "me@example.com" };

const batched: string[] = [];
let batchFails = false;
/** How many commits refuse before the rest succeed — the rules saying no to one tier's attempt. */
let batchRefusals = 0;

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, collectionPath: string) => ({ collectionPath }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  doc: (parent: { collectionPath: string }, docId: string) => ({ path: `${parent.collectionPath}/${docId}` }),
  // The own-row query, recorded as a description rather than run: what matters is that the field
  // and the value came from the DECLARATION and the session, not from anything a caller passed.
  query: (source: { collectionPath: string }, clause: { field: string; value: unknown }, cap: { rows: number }) => {
    capped.push(cap.rows);
    return { ...source, clause, cap };
  },
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  limit: (rows: number) => ({ rows }),
  getDocs: (asked: { collectionPath: string; clause: { field: string; value: unknown }; cap: { rows: number } }) => {
    const rows = queryable.get(asked.collectionPath) ?? [];
    return Promise.resolve({
      docs: rows
        .filter((row) => row.data[asked.clause.field] === asked.clause.value)
        // The fake honours the cap, so a host that stopped passing one would hand back more rows
        // than it asked for and the assertion would notice.
        .slice(0, asked.cap.rows)
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
        const held = docs.store.get(collectionPath)?.has(id) === true;
        return Promise.resolve({ exists: () => held });
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`set ${ref.path} ${JSON.stringify(data)}`),
      update: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`update ${ref.path} ${JSON.stringify(data)}`),
      delete: (ref: { path: string }) => ops.push(`delete ${ref.path}`),
    });
    if (batchFails) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    batched.push(...ops);
  },
  writeBatch: () => {
    const ops: string[] = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`set ${ref.path} ${JSON.stringify(data)}`),
      update: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`update ${ref.path} ${JSON.stringify(data)}`),
      delete: (ref: { path: string }) => ops.push(`delete ${ref.path}`),
      commit: () => {
        if (batchRefusals > 0) {
          batchRefusals -= 1;
          return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
        }
        if (batchFails) return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
        batched.push(...ops);
        return Promise.resolve();
      },
    };
  },
}));

vi.mock("../../../server/backends/remoteHost/session.js", () => ({ currentFirestore: () => ({}) }));

/** The row cap each own-row query carried. */
const capped: number[] = [];

/** What `getDocs` can see — filled from the same store the docs seam holds. */
const queryable = new Map<string, { id: string; data: Record<string, unknown> }[]>();

class Docs implements FirestoreDocs {
  readonly store = new Map<string, Map<string, Record<string, unknown>>>();
  /** Which collection paths refuse a LIST — the ordinary state of a collection people submit to,
   *  where one visitor listing every other visitor's answer is exactly what the rules prevent. */
  denyList = new Set<string>();
  /** Which document paths refuse a GET — how a role scoped to one collection meets `apps/{aid}`. */
  denyGet = new Set<string>();
  created: { path: string; id: string; data: Record<string, unknown> }[] = [];

  put(collectionPath: string, id: string, data: Record<string, unknown>): void {
    const held = this.store.get(collectionPath) ?? new Map<string, Record<string, unknown>>();
    held.set(id, data);
    this.store.set(collectionPath, held);
    queryable.set(
      collectionPath,
      [...held].map(([rowId, row]) => ({ id: rowId, data: row })),
    );
  }

  list = (collectionPath: string): Promise<FirestoreDoc[]> => {
    if (this.denyList.has(collectionPath))
      return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
    const held = this.store.get(collectionPath) ?? new Map();
    return Promise.resolve([...held].sort(([l], [r]) => (l < r ? -1 : 1)).map(([id, data]) => ({ id, data })));
  };

  get = (collectionPath: string, docId: string): Promise<unknown | null> => {
    if (this.denyGet.has(`${collectionPath}/${docId}`)) return Promise.reject(Object.assign(new Error("refused"), { code: "permission-denied" }));
    return Promise.resolve(this.store.get(collectionPath)?.get(docId) ?? null);
  };

  create = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<boolean> => {
    if (this.store.get(collectionPath)?.has(docId)) return Promise.resolve(false);
    this.created.push({ path: collectionPath, id: docId, data });
    this.put(collectionPath, docId, data);
    return Promise.resolve(true);
  };

  set = (): Promise<void> => Promise.resolve();
  delete = (): Promise<boolean> => Promise.resolve(true);
  watch = (): (() => void) => () => {};
}

let docs = new Docs();

const bookingsPath = `apps/${AID}/collections/bookings/items`;
const slotsPath = `apps/${AID}/collections/slots/items`;

/** The submit declaration, as `config/public` publishes it — the window already lowered, every
 *  other key passed through by the name the rules read it under. */
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
function publish({ memberTier = true, roles = { "*": "editor" } as Record<string, string> | null, writers = [ME.email] } = {}): void {
  docs.put("appSlugs", "sakura", { aid: AID, published: true });
  if (roles !== null) docs.put("apps", AID, { aid: AID, name: "Sakura Hair", members: { [ME.email]: roles }, memberEmails: [ME.email] });
  docs.put(`apps/${AID}/config`, "public", {
    protocol: "1.0.0",
    name: "Sakura Hair",
    enabled: true,
    read: ["slots"],
    submit: { bookings: submitBlock },
    form: {
      bookings: {
        fields: {
          requesterEmail: { label: "Email", type: "email" },
          slot: { label: "Slot", type: "string", required: true },
          status: { label: "Status", type: "string" },
          // The two types publish deliberately allows, and that a string-only tool was accused of
          // making unsubmittable.
          guests: { label: "Guests", type: "number" },
          seat: { label: "Seat", type: "enum", values: ["window", "aisle"] },
        },
        statusField: "status",
      },
    },
    // The roster tier's own writes, which `config/public` carries whether or not the app publishes
    // any page at all — the half a participant needs and the reason this works with no views.
    write: [{ cid: "bookings", statusField: "status", transitions: { booked: ["cancelled"] }, selfDelete: ["booked"], withdrawMirror: "slots" }],
    publishedAt: 1,
  });
  if (memberTier)
    // The tier's own id, taken from the package rather than spelled here: it carries a `live:`
    // prefix, and a document written at "config" is a document nothing reads.
    docs.put(appViewTierPath(AID, "member"), viewConfigDocId(), {
      protocol: "1.0.0",
      views: [{ id: "desk", collections: [{ cid: "bookings", scope: "all" }] }],
      submit: {},
      write: [
        {
          cid: "bookings",
          statusField: "status",
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

const run = (args: Record<string, unknown>): Promise<string> => useSharedApp(args);

describe("useSharedApp — taking part in somebody else's app", () => {
  beforeAll(() => {
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs, email: ME.email, uid: ME.uid }));
  });

  beforeEach(() => {
    docs = new Docs();
    queryable.clear();
    capped.length = 0;
    batched.length = 0;
    batchFails = false;
    batchRefusals = 0;
    process.env.MULMOTERMINAL_HOME = makeTempDir("mt-participate-home-");
  });

  it("describes an app it has never held, from its published documents alone", async () => {
    publish();
    const said = await run({ action: "describe", slug: "sakura" });
    expect(said).toContain("Sakura Hair");
    expect(said).toContain("editor of the whole app");
    expect(said).toContain("bookings (member): move any row's status");
    // The participant's own half, from `config/public` — present although the app published no
    // participant page whatsoever.
    expect(said).toContain("withdraw your own row while it is: booked");
    expect(said).toContain("booked -> approved");
    // The form, with the host-filled fields kept out of it: an address compared to the token, a
    // status pinned to `initialStatus`.
    expect(said).toContain("slot* (Slot, string)");
    // The type and the choices, so the agent does not fill an enum in from the field's NAME.
    expect(said).toContain("guests (Guests, number)");
    expect(said).toContain("seat (Seat, enum, one of: window / aisle)");
    expect(said).not.toContain("requesterEmail (Email)");
  });

  it("says so, rather than guessing, when the app document is not readable", async () => {
    publish();
    docs.denyGet.add(`apps/${AID}`);
    const said = await run({ action: "describe", slug: "sakura" });
    expect(said).toContain("Your roles: not readable");
    // The capability still resolves: it comes from the tier projections, which this reader may read.
    expect(said).toContain("bookings (member): move any row's status");
  });

  it("refuses a URL name nothing answers to", async () => {
    const said = await run({ action: "describe", slug: "nobody" });
    expect(said).toContain('No shared app answers to "nobody"');
  });

  it("remembers an app it described, lists it, and forgets it again", async () => {
    publish();
    expect(await run({ action: "apps" })).toContain("No shared apps are remembered");
    await run({ action: "describe", slug: "sakura" });
    expect(await run({ action: "apps" })).toContain("sakura — Sakura Hair");
    expect(await run({ action: "forget", slug: "sakura" })).toContain('Forgot "sakura"');
    expect(await run({ action: "apps" })).toContain("No shared apps are remembered");
  });

  it("lists a whole collection when the rules open it", async () => {
    publish();
    docs.put(slotsPath, "10:00", { state: "open" });
    const said = await run({ action: "records", slug: "sakura", cid: "slots" });
    expect(said).toContain("the whole collection");
    expect(said).toContain("10:00");
  });

  it("falls back to the reader's OWN rows when the list is refused, and says which it gave", async () => {
    publish();
    docs.denyList.add(bookingsPath);
    docs.put(bookingsPath, "10:00", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    docs.put(bookingsPath, "11:00", { requesterEmail: "someone@example.com", slot: "11:00", status: "booked" });
    const said = await run({ action: "records", slug: "sakura", cid: "bookings" });
    expect(said).toContain("YOUR OWN ONLY");
    expect(said).toContain("do not describe it as one");
    expect(said).toContain("10:00");
    expect(said).not.toContain("someone@example.com");
  });

  it("submits through the published form, and reports a record rather than a seat", async () => {
    publish();
    docs.put(slotsPath, "10:00", { state: "open" });
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00", guests: "2", seat: "window" } });
    expect(said).toContain("The record's id is 10:00");
    // The mirror travelled with it, in ONE batch: the rules read the second document with
    // `getAfter()`, so a mirror written singly is refused with nothing to say why.
    expect(batched).toEqual([
      // The typed fields land as the STRINGS they were sent as, which is what mulmoserver's own
      // page writes for them (`recordOf` takes `Record<string, string>` and writes it verbatim).
      // Coercing here would make this host write a different document than the page for the same
      // answer — read differently by the app's own views.
      `set ${bookingsPath}/10:00 ${JSON.stringify({ slot: "10:00", guests: "2", seat: "window", requesterEmail: ME.email, status: "booked" })}`,
      `update ${slotsPath}/10:00 {"state":"taken"}`,
    ]);
    // Principle 3, said out loud: what a create buys is a position, and this report must never
    // promise more than that.
    expect(said).toContain("not a place held");
    expect(said.toLowerCase()).not.toContain("reserved");
    expect(said.toLowerCase()).not.toContain("secured");
  });

  it("refuses a slot somebody already holds, inside the transaction", async () => {
    publish();
    docs.put(slotsPath, "10:00", { state: "taken" });
    docs.put(bookingsPath, "10:00", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00" } });
    expect(said).toContain("somebody has it");
    // Nothing was written. The read that refused is INSIDE the transaction, which is what stops a
    // writer's `set` from replacing the booking that is already there: `mirrorClaimed` in the rules
    // only asks that the mirror end up `taken`, so a slot another participant just claimed would
    // have satisfied it.
    expect(batched).toEqual([]);
  });

  it("names the missing field rather than letting the rules refuse it namelessly", async () => {
    publish();
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: {} });
    expect(said).toContain("missing: Slot");
  });

  it("moves a record on the member tier and queues the declared notice in the same batch", async () => {
    publish();
    docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain('Moved bookings/b1 to "approved"');
    expect(said).toContain("Judged on the member tier");
    expect(said).toContain("A notification was QUEUED");
    expect(batched).toEqual([
      `update ${bookingsPath}/b1 {"status":"approved"}`,
      // The id the RULES rebuild. A different spelling queues a document the mail rule refuses.
      `set apps/${AID}/mail/bookings_b1_approved ${JSON.stringify({ cid: "bookings", itemId: "b1", to: "guest@example.com", template: "approved" })}`,
    ]);
  });

  it("names the declaration when a move is not in the table, and writes nothing", async () => {
    publish();
    docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "approved" });
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "booked" });
    expect(said).toContain("illegal-transition");
    expect(batched).toEqual([]);
  });

  it("refuses a move a reader holding no writing role can make on neither tier", async () => {
    publish({ memberTier: false });
    docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("roster: illegal-transition");
    expect(batched).toEqual([]);
  });

  it("withdraws the reader's own row and reopens the slot in one batch", async () => {
    publish();
    docs.put(bookingsPath, "10:00", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    docs.put(slotsPath, "10:00", { state: "taken" });
    const said = await run({ action: "withdraw", slug: "sakura", cid: "bookings", id: "10:00" });
    expect(said).toContain("The record is gone");
    expect(said).toContain("There is no undo");
    expect(batched).toEqual([`delete ${bookingsPath}/10:00`, `update ${slotsPath}/10:00 {"state":"open"}`]);
  });

  it("caps the own-row query in the QUERY, not after the fetch", async () => {
    publish();
    docs.denyList.add(bookingsPath);
    for (let n = 0; n < 5; n += 1) docs.put(bookingsPath, `b${n}`, { requesterEmail: ME.email, slot: `${n}:00`, status: "booked" });
    const said = await run({ action: "records", slug: "sakura", cid: "bookings", limit: 2 });
    // The cap reached Firestore rather than being applied to a fetched result: the query carried it,
    // so what came back is already two rows.
    expect(capped).toEqual([2]);
    expect(said).toContain("2 row(s)");
  });

  it("refuses an assignee nobody on the roster could be", async () => {
    publish();
    docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "assign", slug: "sakura", cid: "bookings", id: "b1", to: "stranger@example.com" });
    // Refused by NAME. Written, the row would belong to somebody who may never touch it again.
    expect(said).toContain("unknown-assignee");
    expect(batched).toEqual([]);
  });

  it("refuses a move this reader's role does not carry, and says which tier said what", async () => {
    publish({ writers: ["somebody-else@example.com"] });
    docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("member:");
    expect(said).toContain("roster:");
    expect(batched).toEqual([]);
  });

  it("tries the next tier when the RULES refuse the first tier's write", async () => {
    publish();
    docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    // Both tiers carry `booked -> cancelled`, so the member projection is judged first and its
    // write is the one the rules turn down. Stopping there would deny this person a move they hold
    // as the row's own submitter.
    batchRefusals = 1;
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "cancelled" });
    expect(said).toContain("Judged on the roster tier");
    // ONE write landed — the refused batch wrote nothing, which is what makes the retry safe.
    expect(batched).toEqual([`update ${bookingsPath}/b1 {"status":"cancelled"}`]);
  });

  it("never asks Firestore for nought rows", async () => {
    publish();
    docs.denyList.add(bookingsPath);
    docs.put(bookingsPath, "b0", { requesterEmail: ME.email, slot: "0:00", status: "booked" });
    // `Math.floor(0.5)` is 0, and `limit(0)` is REFUSED by Firestore at the moment the constraint is
    // built — before the read this tool wraps in a catch. So half a row would have thrown where
    // every other bad argument produces a sentence.
    const said = await run({ action: "records", slug: "sakura", cid: "bookings", limit: 0.5 });
    expect(capped).toEqual([DEFAULT_ROWS]);
    expect(said).toContain("YOUR OWN ONLY");
  });

  it("keeps a refused read apart from an absent record", async () => {
    publish();
    docs.denyGet.add(`${bookingsPath}/b1`);
    expect(await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" })).toContain("could not be read");
    expect(await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b2", to: "approved" })).toContain('no record "b2"');
    expect(batched).toEqual([]);
  });

  it("reports what the rules said when they refuse the write this host judged fine", async () => {
    publish();
    docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    batchFails = true;
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("Missing or insufficient permissions");
  });
});
