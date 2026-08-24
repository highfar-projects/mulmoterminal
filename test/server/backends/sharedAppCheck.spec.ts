// @vitest-environment node
//
// `check` opens the PAGES, not only the declaration.
//
// It exists to answer "would a deploy be refused?" before anything is written, and a `path` naming
// a file that is not there is one of the ways a deploy IS refused. Answering that question from
// `app.json` alone called such an app deployable and left the refusal for the deploy — the exact
// point in the flow this action exists to move earlier. The warnings ride along for the same
// reason: they are what an author still has time to act on.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { checkSharedApp } from "../../../server/backends/sharedApp/declare.js";
import { makeTempDir } from "../../support/tempDir";

const AID = "11111111-2222-3333-4444-555555555555";

/** A shared collection committed beside the declaration, which is what makes it this app's
 *  (`sharedCollections` discovers by repository, never from `~/.claude/skills`). */
const withSlots = (root: string): void => {
  const dir = path.join(root, ".claude", "skills", "slots");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), "---\nname: slots\ndescription: bookable slots\n---\n");
  writeFileSync(
    path.join(dir, "schema.json"),
    JSON.stringify({
      title: "Slots",
      icon: "schedule",
      primaryKey: "id",
      storage: { type: "firestore" },
      fields: {
        id: { type: "string", label: "ID", primary: true, required: true },
        startAt: { type: "datetime", label: "Start", required: true },
      },
    }),
  );
};

/** A signed-in session over records the test supplies. `list` ignores the path: what is under test
 *  is whether `check` READS the records at all, not how the store addresses them. */
const withSession = (docs: FirestoreDoc[]): void => {
  setFirestoreAccessor(() => ({
    email: "owner@example.com",
    uid: "uid_owner",
    docs: {
      list: async () => docs,
      get: async () => null,
      set: async () => {},
      create: async () => true,
      delete: async () => false,
      watch: () => () => {},
    },
  }));
};

/** An app that declares one public page, and whatever HTML the test wants behind it. */
const withApp = (root: string, html: string | null): void => {
  writeFileSync(
    path.join(root, "app.json"),
    JSON.stringify({
      aid: AID,
      name: "Sign-ups",
      slug: "sign-ups",
      members: { "owner@example.com": { "*": "owner" } },
      collections: { signups: { submitOnly: true, statusField: "status" } },
      public: {
        enabled: true,
        read: ["menu"],
        submit: { signups: { auth: "verifiedEmail", emailField: "email", createFields: ["name", "email", "status"], initialStatus: "submitted" } },
      },
      views: [{ id: "public", audience: "public", path: "views/signup.html", collections: ["menu"] }],
    }),
  );
  if (html === null) return;
  mkdirSync(path.join(root, "views"), { recursive: true });
  writeFileSync(path.join(root, "views", "signup.html"), html);
};

/** An app whose public form is `bytes` of labels — the one thing that decides whether the
 *  world-readable config document fits. Written as one collection of equal fields so a test can say
 *  "just over" and "just under" the budget without arithmetic in the assertion. */
const withFormOfSize = (root: string, bytes: number): void => {
  const dir = path.join(root, ".claude", "skills", "answers");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), "---\nname: answers\ndescription: answers\n---\n");
  const names = Array.from({ length: 40 }, (_, index) => `q${index}`);
  const per = Math.floor(bytes / names.length);
  const fields: Record<string, unknown> = { id: { type: "string", label: "ID", primary: true, required: true } };
  for (const name of names) fields[name] = { type: "string", label: "x".repeat(per) };
  writeFileSync(path.join(dir, "schema.json"), JSON.stringify({ title: "Answers", icon: "list", primaryKey: "id", storage: { type: "firestore" }, fields }));
  writeFileSync(
    path.join(root, "app.json"),
    JSON.stringify({
      aid: AID,
      name: "Big",
      members: { "owner@example.com": { "*": "owner" } },
      collections: { answers: { submitOnly: true } },
      public: { enabled: true, read: [], submit: { answers: { auth: "verifiedEmail", emailField: "q0", createFields: names } } },
    }),
  );
};

describe("check", () => {
  let root: string;

  beforeAll(() => {
    // `check` discovers this repository's collections on the way, and discovery needs the host
    // binding. ONE per file — a second call with a different host is refused.
    initCollectionsBackend({ workspace: makeTempDir("mt-shared-app-check-ws-") });
    setSharedCollectionsSupport(true);
  });

  beforeEach(() => {
    root = makeTempDir("mt-shared-app-check-");
    // Signed out is the default here, as it is for an author who has not connected.
    setFirestoreAccessor(null);
  });

  it("refuses a view whose file is not there", async () => {
    // The template that declared two pages and shipped neither passed `check` and failed at
    // deploy, which is the one thing this action promises not to let happen.
    withApp(root, null);
    const report = await checkSharedApp(root);
    expect(report.ok).toBe(true);
    expect(report.ok && report.problems.join(" ")).toContain("could not be opened as a plain file");
  });

  it("carries the page's warnings, without making them refusals", async () => {
    // A `<form>` cannot submit in the sandbox and an `onState` with no reachable `ready()` is never
    // sent anything — both silent, both survivable, so they are said and the deploy goes on.
    withApp(root, '<form id="f"><button type="submit">go</button></form><script>view.onState((d) => { draw(d); view.ready(); });</script>');
    const report = await checkSharedApp(root);
    expect(report.ok).toBe(true);
    expect(report.ok && report.warnings.join(" ")).toContain("allow-forms");
    expect(report.ok && report.warnings.join(" ")).toContain("ready()");
    expect(report.ok && report.problems.join(" ")).not.toContain("allow-forms");
  });

  it("says nothing about a page that is fine", async () => {
    withApp(root, '<div id="grid"></div><script>view.onState((d) => draw(d)); view.ready();</script>');
    const report = await checkSharedApp(root);
    expect(report.ok && report.warnings).toEqual([]);
  });

  it("names the live records publish would refuse", async () => {
    // The trip this closes (#1763): `putItems` took 720 seeded slots whose `datetime` carried a
    // `Z`, because the write path checks required fields and enums and not the SHAPE of a typed
    // value. `check` said deployable, publish refused every one of them.
    withApp(root, '<div id="grid"></div><script>view.onState((d) => draw(d)); view.ready();</script>');
    withSlots(root);
    withSession([{ id: "court-a-0800", data: { id: "court-a-0800", startAt: "2026-08-17T15:00:00.000Z" } }]);
    const report = await checkSharedApp(root);
    expect(report.ok).toBe(true);
    expect(report.ok && report.records.scanned && report.records.scan.records).toBe(1);
    expect(report.ok && report.records.scanned && report.records.scan.lines.join(" ")).toContain("startAt");
  });

  it("says the DECLARATION is why nothing was scanned, not the session", async () => {
    // A signed-in author whose `app.json` does not parse was told the records went unscanned
    // because they were not signed in — which sends them to reconnect, and the file stays broken.
    // Nothing can be scanned here for a different reason: the manifest is what names the app and
    // its collections.
    writeFileSync(path.join(root, "app.json"), "{ not json");
    withSession([]);
    const report = await checkSharedApp(root);
    expect(report.ok).toBe(true);
    expect(report.ok && report.records).toEqual({ scanned: false, why: "unparsed-declaration" });
    expect(report.ok && report.checkedAs).toBe("owner@example.com");
  });

  it("keeps a collection it could not read apart from a record that does not fit", async () => {
    withApp(root, '<div id="grid"></div><script>view.onState((d) => draw(d)); view.ready();</script>');
    withSlots(root);
    setFirestoreAccessor(() => ({
      email: "owner@example.com",
      uid: "uid_owner",
      docs: {
        list: () => Promise.reject(new Error("permission denied")),
        get: async () => null,
        set: async () => {},
        create: async () => true,
        delete: async () => false,
        watch: () => () => {},
      },
    }));
    const report = await checkSharedApp(root);
    expect(report.ok && report.records.scanned && report.records.scan.unreadable.join(" ")).toContain("slots");
    // Nothing is KNOWN about those rows, so they are not counted as rows that do not fit — the two
    // send an author to opposite repairs (access, not a migration).
    expect(report.ok && report.records.scanned && report.records.scan.records).toBe(0);
  });

  it("refuses an identity key that moved under live records, as publish does", async () => {
    // The half `check` used to miss. Publish runs `frozenKeyProblems` as well as the record scan,
    // and `confirm` does not override it — so an agent that heard "publishable" here met the
    // refusal at the one step where the only thing left to reach for does not work.
    withApp(root, '<div id="grid"></div><script>view.onState((d) => draw(d)); view.ready();</script>');
    withSlots(root);
    setFirestoreAccessor(() => ({
      email: "owner@example.com",
      uid: "uid_owner",
      docs: {
        // One booking already written under the OLD key, and the app document that names it.
        list: async () => [{ id: "court-a-0800", data: { id: "court-a-0800" } }],
        get: async () => ({ public: { submit: { signups: { idFrom: "field", idField: "slot" } } } }),
        set: async () => {},
        create: async () => true,
        delete: async () => false,
        watch: () => () => {},
      },
    }));
    const report = await checkSharedApp(root);
    expect(report.ok).toBe(true);
    expect(report.ok && report.problems.join(" ")).toContain("WHICH DOCUMENT a submission claims");
    expect(report.ok && report.problems.join(" ")).toContain("`confirm` overrides");
  });

  it("says the identity keys went uncompared when the app document could not be read", async () => {
    // The two live reads are INDEPENDENT: the scan lists `…/items`, the key gate reads `apps/{aid}`.
    // A scan that completed therefore says nothing about the gate — and a silent gate would let
    // `check` answer "publishable" for a declaration nothing compared, which is the one refusal
    // `confirm` does not get past at publish.
    withApp(root, '<div id="grid"></div><script>view.onState((d) => draw(d)); view.ready();</script>');
    withSlots(root);
    setFirestoreAccessor(() => ({
      email: "owner@example.com",
      uid: "uid_owner",
      docs: {
        list: async () => [],
        get: () => Promise.reject(Object.assign(new Error("unavailable (test)"), { code: "unavailable" })),
        set: async () => {},
        create: async () => true,
        delete: async () => false,
        watch: () => () => {},
      },
    }));
    const report = await checkSharedApp(root);
    expect(report.ok).toBe(true);
    // The records DID scan — which is exactly why the key gate has to answer for itself.
    expect(report.ok && report.records.scanned).toBe(true);
    expect(report.ok && report.keys).toEqual({ compared: false, why: "unreadable-app" });
  });

  it("refuses a public form too large for one document, with no connection", async () => {
    // Publish's size gate, asked where it costs nothing. It used to run only mid-publish — after
    // the app document had been established and the schemas were on their way out — and the
    // database's own refusal says only that a document was too large, naming no app and no field.
    // Signed out on purpose: this half of the gate reads nothing live, and that is what it claims.
    withFormOfSize(root, 900_000);

    const report = await checkSharedApp(root);
    expect(report.ok).toBe(true);
    expect(report.ok && report.problems.join(" ")).toContain("the public form comes to");
    expect(report.ok && report.problems.join(" ")).toContain("has to fit in one Firestore document");
    // Said with nobody signed in, which is the path this half of the gate advertises.
    expect(report.ok && report.checkedAs).toBeNull();
  });

  it("says nothing about a large form that still fits", async () => {
    // The other side of the boundary, because a gate that refuses everything large is the same
    // mistake in the other direction: a big form is a normal app, and only 700 kB is the line.
    withFormOfSize(root, 600_000);

    const report = await checkSharedApp(root);
    expect(report.ok && report.problems.join(" ")).not.toContain("the public form comes to");
  });

  it("scans nothing, and says so, when there is no session", async () => {
    // `check` answers offline and must keep doing so — but a report with no record line reads as
    // "the records are fine", which is the belief that carried those 720 rows to a publish. The
    // null is what the tool turns into a said-out-loud "NOT scanned".
    withApp(root, '<div id="grid"></div><script>view.onState((d) => draw(d)); view.ready();</script>');
    withSlots(root);
    const report = await checkSharedApp(root);
    expect(report.ok).toBe(true);
    expect(report.ok && report.records).toEqual({ scanned: false, why: "no-session" });
  });
});
