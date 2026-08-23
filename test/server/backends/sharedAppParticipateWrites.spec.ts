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
import { AID, bookingsPath, freshBag, ME, publishApp, slotsPath, type Bag } from "../../support/participateHarness.js";
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
    expect(said).toContain("The record's id is 10:00");
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
    expect(said).toContain("The record's id is 10:00");
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
    expect(said).toContain("The record's id is 10:00");
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
    expect(await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b2", to: "approved" })).toContain('no record "b2"');
    expect(bag.batched).toEqual([]);
  });

  it("reports what the rules said when they refuse the write this host judged fine", async () => {
    publish();
    bag.docs.put(bookingsPath, "b1", { requesterEmail: "guest@example.com", slot: "10:00", status: "booked" });
    bag.batchFails = true;
    const said = await run({ action: "transition", slug: "sakura", cid: "bookings", id: "b1", to: "approved" });
    expect(said).toContain("Missing or insufficient permissions");
  });
});
