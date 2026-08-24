// @vitest-environment node
//
// `check` answers for the STANDING INSTRUCTIONS too, offline and before anything is written.
//
// The refusals themselves belong to `@receptron/sharedapp` (`publishProblems`) and are tested
// there against declarations built by hand. What is pinned HERE is that they travel: `check` runs
// publish's own gate over the repository's real collections, so an author asking "would this
// publish?" is told about a brief nobody could carry out, and about one whose duty would land on
// the world-readable document.
//
// The warnings ride along for the reason the pages' do: they are what an author still has time to
// act on, and a gate that STOPPED for them would be a gate people learn to skim.
//
// Design: plans/feat-shared-app-agents.md
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { checkSharedApp } from "../../../server/backends/sharedApp/declare.js";
import { makeTempDir } from "../../support/tempDir";

const AID = "11111111-2222-3333-4444-555555555555";
const OWNER = "owner@example.com";

/** The one shared collection this repository has: bookings people submit and staff approve. */
const withBookings = (root: string): void => {
  const dir = path.join(root, ".claude", "skills", "bookings");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), "---\nname: bookings\ndescription: bookings\n---\n");
  writeFileSync(
    path.join(dir, "schema.json"),
    JSON.stringify({
      title: "Bookings",
      icon: "event",
      primaryKey: "id",
      storage: { type: "firestore" },
      fields: {
        id: { type: "string", label: "ID", primary: true, required: true },
        email: { type: "email", label: "Email", required: true },
        startAt: { type: "datetime", label: "Start" },
        status: { type: "enum", label: "Status", values: ["pending", "approved"] },
      },
    }),
  );
};

const withApp = (root: string, overrides: Record<string, unknown>): void => {
  writeFileSync(
    path.join(root, "app.json"),
    JSON.stringify({
      aid: AID,
      name: "Sakura",
      members: { [OWNER]: { "*": "owner" } },
      collections: { bookings: { submitOnly: true, statusField: "status", transitions: { initial: ["pending"], pending: ["approved"] } } },
      public: {
        enabled: true,
        read: [],
        submit: {
          bookings: { auth: "verifiedEmail", emailField: "email", createFields: ["email", "startAt", "status"], initialStatus: "pending" },
        },
      },
      ...overrides,
    }),
  );
};

const problemsOf = async (root: string): Promise<string[]> => {
  const report = await checkSharedApp(root);
  expect(report.ok).toBe(true);
  return report.ok && "problems" in report ? report.problems : [];
};

const warningsOf = async (root: string): Promise<string[]> => {
  const report = await checkSharedApp(root);
  return report.ok && "warnings" in report ? report.warnings : [];
};

const DESK = { id: "desk", audience: "member", watch: ["bookings"], instruction: "pending の予約を承認する。" };

describe("check — the app's standing instructions", () => {
  let root: string;

  beforeAll(() => {
    initCollectionsBackend({ workspace: makeTempDir("mt-agent-check-ws-") });
    setSharedCollectionsSupport(true);
  });

  beforeEach(() => {
    root = makeTempDir("mt-agent-check-");
    withBookings(root);
    // Signed out, as an author who has not connected — none of this needs a session.
    setFirestoreAccessor(null);
  });

  it("says nothing about a duty this audience can carry out", async () => {
    withApp(root, { agents: [DESK] });
    expect(await problemsOf(root)).toEqual([]);
    expect(await warningsOf(root)).toEqual([]);
  });

  it("names a duty published for the world over a collection the world cannot read", async () => {
    // `bookings` carries an address and a name. A public brief about it is the app's internal
    // vocabulary on a document whose rule is `allow read: if true`.
    withApp(root, { agents: [{ ...DESK, audience: "public" }] });
    expect((await problemsOf(root)).join("\n")).toContain("cannot read");
  });

  it("names a public duty in an app with no public face at all", async () => {
    withApp(root, { public: undefined, agents: [{ id: "greeter", audience: "public", instruction: "こんにちは。" }] });
    expect((await problemsOf(root)).join("\n")).toContain("declares no `public` block");
  });

  it("names a collection that is not in this repository", async () => {
    withApp(root, { agents: [{ ...DESK, watch: ["bookinggs"] }] });
    expect((await problemsOf(root)).join("\n")).toContain("not a shared collection");
  });

  it("warns, without stopping, about a duty nothing will ever wake up", async () => {
    withApp(root, { agents: [{ id: "desk", audience: "member", collections: ["bookings"], instruction: "頼まれたら承認する。" }] });
    expect(await problemsOf(root)).toEqual([]);
    expect((await warningsOf(root)).join("\n")).toContain("no `watch`");
  });
});
