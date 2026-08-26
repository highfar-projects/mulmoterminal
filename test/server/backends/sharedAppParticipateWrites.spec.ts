// @vitest-environment node
//
// WRITING to somebody else's app: submissions, transitions, assignments and withdrawals.
//
// TAKING PART in an app somebody else published. The property under test is not the one
// `sharedAppPreviewIntent.spec.ts` pins: there the author is the app's OWNER and the host must not
// be looser than production, while here every read and write goes out as the signed-in reader, so
// the deployed rules answer for exactly the right person and the host's judgement buys a NAMED
// refusal rather than a permission.
//
// What this half holds: the pairs the rules read with `getAfter()` go out in ONE batch, spelled as
// mulmoserver spells them (the mail id especially — the rules rebuild it from cid, item and
// template, and a divergence queues a document nothing can send); a submission is reported as a
// record written and never as a place held (principle 3); and a write whose outcome is unknown is
// never reported as one that did not happen.
//
// The fake Firestore and the app published into it are `test/support/participateHarness.ts`, shared
// with the sibling file: `vi.mock` is hoisted per FILE, so the mock itself cannot be — what travels
// is what it is made of, and the mutable bag it answers from.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { setFirestoreAccessor, setSharedCollectionsSupport } from "@mulmoclaude/core/collection/server";
import { useSharedApp } from "../../../server/infra/use-shared-app-tool.js";
import { AID, bookingsPath, declareCaps, freshBag, ME, publishApp, slotsPath, type Bag } from "../../support/participateHarness.js";
import { makeTempDir } from "../../support/tempDir";

// CREATED WITH `vi.hoisted` because the mock factory below is hoisted above the imports: a plain
// `const` here would still be in its temporal dead zone when the factory first runs.
const bag = vi.hoisted(
  () =>
    ({
      batched: [],
      batchFails: false,
      batchRefusals: 0,
      batchBreaks: 0,
      capped: [],
      breakQuery: new Set<string>(),
      denyQuery: new Set<string>(),
      queryable: new Map(),
      listeners: [],
    }) as unknown as Bag,
);

// Imported INSIDE the factory, which runs when the module under test first pulls Firestore in —
// long after this file's own imports have been evaluated.
vi.mock("firebase/firestore", async () => (await import("../../support/participateHarness.js")).firestoreMock(bag));
vi.mock("../../../server/backends/remoteHost/session.js", () => ({ currentFirestore: () => ({}) }));

const run = (args: Record<string, unknown>): Promise<string> => useSharedApp(args);
const publish = (options: Parameters<typeof publishApp>[1] = {}): void => publishApp(bag, options);

describe("useSharedApp — writing to somebody else's app", () => {
  beforeAll(() => {
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs: bag.docs, email: ME.email, uid: ME.uid }));
  });

  beforeEach(() => {
    freshBag(bag);
    process.env.MULMOTERMINAL_HOME = makeTempDir("mt-participate-home-");
  });

  it("does not offer an intent to the next tier when the write merely FAILED", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    // Both tiers carry `booked -> cancelled`. Retried after a blip, the roster projection would land
    // the same move carrying no `mail` — the record moves and a declared notice is never queued.
    bag.batchBreaks = 1;
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "cancelled" });
    expect(said).toContain("network");
    // NOT "Refused". A `deadline-exceeded` can come back after Firestore committed and the client
    // lost the answer, so the record may have moved and the notice may have gone out — telling the
    // user it was refused invites a retry that queues a second real email.
    expect(said).toContain("Could not tell whether that landed");
    expect(said).not.toContain("Refused:");
    expect(bag.batched).toEqual([]);
  });

  it("moves a status field whose name contains a dot as a literal key", async () => {
    publish({ dottedStatusField: true });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", "workflow.state": "booked" });
    await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    // The object form would write a map called `workflow` beside the field the state lives in.
    expect(bag.batched[0]).toContain(JSON.stringify({ "workflow.state": "approved" }));
  });

  it("submits through the published form, and reports a record rather than a seat", async () => {
    publish();
    bag.docs.put(slotsPath, "10:00", { state: "open" });
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00", guests: "2", seat: "window" } });
    expect(said).toContain("The record's id is \u00ab10:00\u00bb");
    // The mirror travelled with it, in ONE batch: the rules read the second document with
    // `getAfter()`, so a mirror written singly is refused with nothing to say why.
    expect(bag.batched).toEqual([
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
    bag.docs.put(slotsPath, "10:00", { state: "taken" });
    bag.docs.put(bookingsPath, "10:00", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00" } });
    expect(said).toContain("somebody has it");
    // Nothing was written. The read that refused is INSIDE the transaction, which is what stops a
    // writer's `set` from replacing the booking that is already there: `mirrorClaimed` in the rules
    // only asks that the mirror end up `taken`, so a slot another participant just claimed would
    // have satisfied it.
    expect(bag.batched).toEqual([]);
  });

  it("claims a slot without reading it, for a submitter the rules will not let read", async () => {
    publish();
    bag.docs.put(slotsPath, "10:00", { state: "open" });
    // A participant reaches a booking only through `ownRow`, which reads fields off a document that
    // does not exist yet — so the rules deny this get, and a transaction opening with it would be
    // refused before it wrote anything. The paired write still has to go out.
    bag.docs.denyGet.add(`${bookingsPath}/10:00`);
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00" } });
    expect(said).toContain("The record's id is \u00ab10:00\u00bb");
    expect(bag.batched).toEqual([
      `set ${bookingsPath}/10:00 ${JSON.stringify({ slot: "10:00", requesterEmail: ME.email, status: "booked" })}`,
      `update ${slotsPath}/10:00 {"state":"taken"}`,
    ]);
  });

  it("writes nothing when the destination read merely FAILED rather than being refused", async () => {
    publish();
    bag.docs.put(slotsPath, "10:00", { state: "open" });
    bag.docs.breakGet.add(`${bookingsPath}/10:00`);
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00" } });
    // A blip is not a refusal. Read as one, a WRITER would take the unchecked branch — the one that
    // can turn `set` into an update over somebody else's booking.
    expect(said).toContain("network");
    expect(bag.batched).toEqual([]);
  });

  it("answers a private form whose collection the submitter may not read", async () => {
    // No mirror: the whole submission is one document. Both checked shapes open by READING the id
    // — core's `create` runs a transaction that does — and on a collection reached only through
    // `ownRow` the rules deny that read, so a private survey could not be answered at all.
    publish({ mirror: false });
    bag.docs.denyGet.add(`${bookingsPath}/10:00`);
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00" } });
    expect(said).toContain("The record's id is \u00ab10:00\u00bb");
    // Through the seam's plain `set`, which is what a submission with no mirror needs — and which
    // does not ask for an SDK handle the caller may not have.
    expect(bag.docs.sets).toEqual([`${bookingsPath}/10:00`]);
    expect(bag.batched).toEqual([]);
  });

  it("names the missing field rather than letting the rules refuse it namelessly", async () => {
    publish();
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: {} });
    expect(said).toContain("missing: \u00abSlot\u00bb");
  });

  it("moves a record on the member tier and queues the declared notice in the same batch", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("Moved «bookings»/«b1» to «approved»");
    expect(said).toContain("Judged on the member tier");
    expect(said).toContain("A notification was QUEUED");
    expect(bag.batched).toEqual([
      `update ${bookingsPath}/b1 {"status":"approved"}`,
      // The id the RULES rebuild. A different spelling queues a document the mail rule refuses.
      `set apps/${AID}/mail/bookings_b1_approved ${JSON.stringify({ cid: "bookings", itemId: "b1", to: "guest@example.com", template: "approved" })}`,
    ]);
  });

  it("names the declaration when a move is not in the table, and writes nothing", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "approved" });
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "booked" });
    expect(said).toContain("illegal-transition");
    expect(bag.batched).toEqual([]);
  });

  it("refuses a move a reader holding no writing role can make on neither tier", async () => {
    publish({ memberTier: false });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("roster: illegal-transition");
    expect(bag.batched).toEqual([]);
  });

  it("withdraws the reader's own row and reopens the slot in one batch", async () => {
    publish();
    bag.docs.put(bookingsPath, "10:00", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    bag.docs.put(slotsPath, "10:00", { state: "taken" });
    const said = await run({ action: "withdraw", slug: "sakura", cid: "bookings", id: "10:00" });
    expect(said).toContain("The record is gone");
    expect(said).toContain("There is no undo");
    expect(bag.batched).toEqual([`delete ${bookingsPath}/10:00`, `update ${slotsPath}/10:00 {"state":"open"}`]);
  });

  it("refuses an assignee nobody on the roster could be", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "assign", slug: "sakura", cid: "bookings", id: "b1", to: "stranger@example.com" });
    // Refused by NAME. Written, the row would belong to somebody who may never touch it again.
    expect(said).toContain("unknown-assignee");
    expect(bag.batched).toEqual([]);
  });

  it("refuses a move this reader's role does not carry, and says which tier said what", async () => {
    publish({ writers: ["somebody-else@example.com"] });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("member:");
    expect(said).toContain("roster:");
    expect(bag.batched).toEqual([]);
  });

  it("tries the next tier when the RULES refuse the first tier's write", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    // Both tiers carry `booked -> cancelled`, so the member projection is judged first and its
    // write is the one the rules turn down. Stopping there would deny this person a move they hold
    // as the row's own submitter.
    bag.batchRefusals = 1;
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "cancelled" });
    expect(said).toContain("Judged on the roster tier");
    // ONE write landed — the refused batch wrote nothing, which is what makes the retry safe.
    expect(bag.batched).toEqual([`update ${bookingsPath}/b1 {"status":"cancelled"}`]);
  });

  it("does not report a broken record read as a permission boundary", async () => {
    publish();
    bag.docs.breakGet.add(`${bookingsPath}/b1`);
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("worth making again");
    expect(said).not.toContain("not readable by you");
    expect(bag.batched).toEqual([]);
  });

  it("keeps a refused read apart from an absent record", async () => {
    publish();
    bag.docs.denyGet.add(`${bookingsPath}/b1`);
    expect(await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" })).toContain("not readable by you");
    expect(await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b2", to: "approved" })).toContain("no record \u00abb2\u00bb");
    expect(bag.batched).toEqual([]);
  });

  it("reports what the rules said when they refuse the write this host judged fine", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    bag.batchFails = true;
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("Missing or insufficient permissions");
  });
  it("refuses a submitted slug that could not be a URL, and names the field", async () => {
    // `idFrom: "slug"` — the id is the article's own name, so a name the rules refuse (`slugOk`) is
    // a write that cannot land. `recordId` in the package refuses it by THROWING, which out of here
    // would reach the agent as a stack trace where this tool's contract is actionable prose.
    publish({ idFromSlug: true });
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "Not A Slug" } });
    expect(said).toContain("bad-name");
    expect(said).toContain("lowercase letters, digits and hyphens");
    expect(bag.batched).toEqual([]);
  });

  it("submits a legal slug as the record's own id", async () => {
    // The positive half, without which the refusal above proves only that something was refused.
    publish({ idFromSlug: true });
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "why-terminals-won" } });
    expect(said).toContain("\u00abwhy-terminals-won\u00bb");
  });

  // --- update: correcting a record you submitted ------------------------------------------------
  //
  // The fourth ask, and the only one that is not a MOVE. It is deliberately NOT part of the intent
  // vocabulary a sandboxed page may send (see `participate/correct.ts`): what makes it available
  // here is who is asking — an agent on the machine of the person whose row it is, on the same
  // footing as that person retyping a paragraph on the app's own page.

  it("corrects the fields the declaration names for the record's current status", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old", guests: "2" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "new" } });
    expect(said).toContain("Corrected");
    expect(bag.batched[0]).toContain(JSON.stringify({ note: "new" }));
  });

  it("writes every corrected field in ONE update", async () => {
    // The rules judge a WRITE and `selfWriteOk` reads the whole diff. Split into one write per
    // field, a two-field correction is two writes either of which can be the one that fails —
    // leaving the record half corrected with nothing able to say which half.
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old", guests: "2" });
    await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "new", guests: "4" } });
    expect(bag.batched).toHaveLength(1);
    expect(bag.batched[0]).toContain(JSON.stringify({ note: "new", guests: "4" }));
  });

  it("refuses a field the current status does not allow, and NAMES it", async () => {
    // The whole reason the host judges at all. The rules would refuse this too, with "Missing or
    // insufficient permissions" and no field in it — which an agent cannot act on.
    // WRITERS ARE SOMEBODY ELSE, deliberately: this is the SUBMITTER's half, and a reader who is
    // also a writer is answered by the ROLE branch instead — any field, any status, no list to
    // compare against.
    publish({ writers: ["desk@example.com"] });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { slot: "11:00" } });
    expect(said).toContain("Not updated");
    expect(said).toContain("\u00abslot\u00bb");
    expect(said).toContain("\u00abbooked\u00bb");
    expect(bag.batched).toEqual([]);
  });

  it("refuses every field when the record is in a status that allows none", async () => {
    // `selfUpdate` is declared PER STATUS, so the answer depends on where the record is now — this
    // is the same row and the same field as the passing case above, after the desk moved it.
    publish({ writers: ["desk@example.com"] });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "approved", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "new" } });
    expect(said).toContain("Not updated");
    expect(bag.batched).toEqual([]);
  });

  it("never moves the status, whatever is sent", async () => {
    // An update changes fields. A status change is `transition`, which is judged against the
    // published table — so a correction that could set `status` would be a way around it.
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { status: "approved" } });
    expect(said).toContain("Not updated");
    expect(bag.batched).toEqual([]);
  });

  it("says what is missing rather than writing an empty update", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked" });
    expect(await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: {} })).toContain("nothing to correct");
    expect(await run({ action: "update", slug: "sakura", cid: "bookings", values: { note: "x" } })).toContain("`cid` and `id` are both required");
    expect(bag.batched).toEqual([]);
  });

  it("does not report a failed write as a refusal", async () => {
    // The same distinction every write here keeps: `deadline-exceeded` can arrive AFTER Firestore
    // committed, so "refused" states the one thing that might be false.
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    bag.batchBreaks = 1;
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "new" } });
    expect(said).toContain("Could not tell whether that landed");
    expect(said).not.toContain("Not updated");
  });

  it("takes the tier that covers the WHOLE ask, not the first one with anything to say", async () => {
    // Codex / CodeRabbit on #1864. A reader admitted to both tiers, whose two projections disagree
    // — which they can, because they are two DOCUMENTS and `runWrites` can stop between them.
    // Answering from the first non-empty one made this host stricter than the rules, which read
    // ONE declaration and would have accepted the write.
    //
    // The app document is DENIED, because that is the only reader the tiers answer for — and with
    // it readable this test passes without reaching the tier code at all.
    publish({ rosterTier: true });
    bag.docs.denyGet.add(`apps/${AID}`);
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old", guests: "2" });
    // The member tier is consulted first and allows only `note` here; the roster's allows `guests`.
    const member = bag.docs.store.get(`apps/${AID}/member`)?.get("live:config") as { write?: Record<string, unknown>[] } | undefined;
    if (member?.write?.[0] !== undefined) member.write[0] = { ...member.write[0], selfUpdate: { booked: ["note"] } };
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { guests: "4" } });
    expect(said).toContain("Corrected");
    expect(bag.batched[0]).toContain(JSON.stringify({ guests: "4" }));
  });

  it("names the widest set when nothing covers the ask", async () => {
    // The refusal has to name the most the reader could have sent, rather than whichever tier
    // happened to be looked at first — otherwise the agent retries against a shorter list.
    publish({ rosterTier: true, writers: ["desk@example.com"] });
    bag.docs.denyGet.add(`apps/${AID}`);
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { slot: "11:00" } });
    expect(said).toContain("Not updated");
    expect(said).toContain("\u00abnote\u00bb");
    expect(bag.batched).toEqual([]);
  });

  it("judges by the declaration the RULES read, not by a tier projection", async () => {
    // `selfWriteOk` resolves `sub()` and `col()` out of `apps/{aid}` — not out of `config/public`,
    // which is a projection of it for the public page, and not out of the tier documents, which are
    // projections for an audience. Where the app document is readable, that is what the preflight
    // must agree with.
    publish({ rosterTier: true, writers: ["desk@example.com"], appDoc: { selfUpdate: { booked: ["guests"] } } });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old", guests: "2" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { guests: "4" } });
    expect(said).toContain("Corrected");
    expect(bag.batched[0]).toContain(JSON.stringify({ guests: "4" }));
  });

  it("refuses a field only a STALE tier still allows, because the rules would refuse it", async () => {
    // THE PARTIAL REPUBLISH. `apps/{aid}`'s public block is the LAST write publish makes, so an
    // interrupted run leaves the rules judging by the PREVIOUS declaration while `config/public`
    // and the tier documents have already moved on. Here the tiers still offer `note` and the
    // rules no longer do — and a preflight that believed the tiers would say "allowed", write, and
    // collect a bare permission error from Firestore. That is the generic failure this whole
    // check exists to replace.
    //
    // It is also why deriving this from `config/public` would be the wrong direction: that document
    // is written EARLIER than the tiers, so it is further ahead of the rules, not closer to them.
    publish({ rosterTier: true, writers: ["desk@example.com"], appDoc: { selfUpdate: { booked: ["guests"] } } });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old", guests: "2" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "new" } });
    expect(said).toContain("Not updated");
    expect(said).toContain("\u00abguests\u00bb");
    expect(bag.batched).toEqual([]);
  });

  it("refuses when the readable declaration allows NOTHING, rather than asking the tiers", async () => {
    // CodeRabbit on #1864. The presence of the app document is what decides, not whether its answer
    // is non-empty: a run that stopped part-way can leave `apps/{aid}` declaring nothing
    // correctable while a tier projection still lists `note`. Falling through there would send a
    // batch the deployed rules refuse with a bare permission error — the exact failure the
    // preflight exists to replace, arriving after the host had said the field was allowed.
    publish({ rosterTier: true, writers: ["desk@example.com"], appDoc: { selfUpdate: {} } });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "new" } });
    expect(said).toContain("Not updated");
    expect(bag.batched).toEqual([]);
  });

  it("falls back to the tier projections when the app document is denied", async () => {
    // A collection-scoped role does not read `apps/{aid}`, so there the tiers are all there is —
    // with the mismatch that implies, which is the same one `performIntent` accepts: the rules
    // answer last either way, and what the host buys is a refusal with a name.
    publish({ rosterTier: true });
    bag.docs.denyGet.add(`apps/${AID}`);
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "new" } });
    expect(said).toContain("Corrected");
  });

  // --- the ROLE half of a correction ------------------------------------------------------------
  //
  // `updateWith` has two branches and `selfUpdate` describes only one of them. `isWriter(r)` sits
  // beside it carrying no status condition and no field list at all — which is what an ordinary
  // blog rests on, because nobody but the author writes there and no `selfUpdate` is ever
  // declared. Answering such an app from `selfUpdate` alone refused its OWNER every correction
  // while the deployed rules allowed all of them.

  it("lets a WRITER correct a field no `selfUpdate` names", async () => {
    // `slot` is outside every `selfUpdate` list in this app — the submitter's case two blocks up
    // is refused for exactly this field. The role is the whole difference.
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { slot: "11:00" } });
    expect(said).toContain("Corrected");
    expect(bag.batched[0]).toContain(JSON.stringify({ slot: "11:00" }));
  });

  it("refuses a WRITER the collection's status, because that is what `transition` is for", async () => {
    // A status moves through the declared table and carries whatever notice the declaration names
    // for that move. A correction able to set it would be a way past both, and the role branch
    // asks nothing about tables.
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { status: "approved" } });
    expect(said).toContain("Not updated");
    expect(said).toContain("transition");
    expect(bag.batched).toEqual([]);
  });

  it("reads the status field from the declaration the RULES read, not from a tier that moved on", async () => {
    // A publish that stops after the tiers and before `apps/{aid}` leaves the two disagreeing, and
    // this guard is what keeps a correction from setting a status. Judged off the tier alone, an
    // author who RENAMED the field mid-publish has the guard looking for `workflow.state` while the
    // rules still judge by `status` — and an update naming `status` sails past it and is committed
    // through the unrestricted writer branch, going round the transition table and the notice bound
    // to the move. (Codex on #1870.)
    publish({ dottedStatusField: true });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { status: "approved" } });
    expect(said).toContain("Not updated");
    expect(bag.batched).toEqual([]);
  });

  it("refuses a frozen field to a WRITER, because no role makes one writable", async () => {
    // `stampHeld`, `idHeld` and `uidHeld` are conjuncts of `updateWith`, AHEAD of the branch that
    // asks who is asking. Before the role branch existed this was unreachable — publish refuses a
    // `selfUpdate` naming any of them — and a writer naming one has no such gate in front of it.
    publish({ frozen: ["bookedAt", "slot"] });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { slot: "11:00" } });
    expect(said).toContain("Not updated");
    expect(said).toContain("\u00abslot\u00bb");
    expect(bag.batched).toEqual([]);
  });

  // --- the declared length cap, which no rule enforces ------------------------------------------
  //
  // Every other refusal these two verbs make is checked again by `firestore.rules`, so a host that
  // skipped one would collect a permission error and somebody would notice. `maxBytes` is not in
  // the rules at all — a length test on `items` create is paid by every app in the deployment,
  // against a bound whose writers the owner invited by name — so a host that skips THIS simply
  // writes the record, at any length, and the index the author published pays on every open.

  it("refuses a submission longer than the app allows, naming the size and the cap", async () => {
    // Both numbers, because an agent told only that something is too long rewrites and retries
    // blind — which for an article means doing it more than once.
    publish();
    declareCaps(bag, { slot: 8 });
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00 in the morning" } });
    expect(said).toContain("too-long");
    expect(said).toContain("20 bytes");
    expect(said).toContain("allows 8");
    expect(bag.batched).toEqual([]);
  });

  it("counts BYTES of UTF-8, not characters", async () => {
    // The whole reason the key is called `maxBytes`. Five Japanese characters are 15 bytes, so a
    // host counting `length` would accept this against a cap of 9 — and the store, the index and
    // the reader's connection are all paid in bytes.
    publish();
    declareCaps(bag, { slot: 9 });
    const said = await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "\u3042\u3044\u3046\u3048\u304a" } });
    expect(said).toContain("15 bytes");
    expect(bag.batched).toEqual([]);
  });

  it("accepts a value of exactly the cap, and any value at all where none is declared", async () => {
    // The acceptance half. A check that refused everything would satisfy both tests above, and an
    // app that has never declared a cap must go on submitting whatever it likes.
    publish();
    declareCaps(bag, { slot: 5 });
    expect(await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "10:00" } })).toContain("Submitted");
    bag.batched.length = 0;
    publish();
    expect(await run({ action: "submit", slug: "sakura", cid: "bookings", values: { slot: "x".repeat(500) } })).toContain("Submitted");
  });

  it("refuses a CORRECTION that would exceed the cap, which is where the length actually moves", async () => {
    // A submission is written once; `selfUpdate` is the verb that lets the same person come back
    // and make the field bigger. A cap enforced only on create bounds the first version of an
    // article and nothing after it.
    publish({ rosterTier: true });
    declareCaps(bag, { note: 6 });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "a much longer note" } });
    expect(said).toContain("too long");
    expect(said).toContain("allows 6");
    expect(bag.batched).toEqual([]);
  });

  it("lets a correction through at exactly the cap", async () => {
    publish({ rosterTier: true });
    declareCaps(bag, { note: 6 });
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    expect(await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "abcdef" } })).toContain("Corrected");
  });

  it("caps a correction from the WORLD-READABLE declaration when the app document is denied", async () => {
    // Codex on #1866. A collection-scoped role cannot read `apps/{aid}`, and requiring it made the
    // cap depend on the reader: the same person was capped when they CREATED a record and uncapped
    // when they corrected it, through a `selfUpdate` the tier projection grants them. A cap a
    // second write escapes is not a cap.
    //
    // Reading `config/public` here is right for a reason that does not apply to `selfUpdate` one
    // function above: THAT one must agree with the deployed rules, which read `apps/{aid}`.
    // `maxBytes` is read by no rule at all, so there is nothing to agree with and the question is
    // only what the author published — which this host already trusts for the same key on submit.
    publish({ rosterTier: true });
    declareCaps(bag, { note: 6 });
    bag.docs.denyGet.add(`apps/${AID}`);
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "a much longer note" } });
    expect(said).toContain("too long");
    expect(said).toContain("allows 6");
    expect(bag.batched).toEqual([]);
  });

  it("still corrects at the cap with the app document denied, so the fallback is not a blanket refusal", async () => {
    publish({ rosterTier: true });
    declareCaps(bag, { note: 6 });
    bag.docs.denyGet.add(`apps/${AID}`);
    bag.docs.put(bookingsPath, "b1", { requesterEmail: ME.email, slot: "10:00", status: "booked", note: "old" });
    expect(await run({ action: "update", slug: "sakura", cid: "bookings", id: "b1", values: { note: "abcdef" } })).toContain("Corrected");
  });

  it("says so when the record is not there", async () => {
    publish();
    const said = await run({ action: "update", slug: "sakura", cid: "bookings", id: "nope", values: { note: "new" } });
    expect(said).toContain("no record");
    expect(bag.batched).toEqual([]);
  });
});
