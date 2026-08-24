// @vitest-environment node
//
// A TIER CAN EXIST WITHOUT PAGES, once an app declares a standing instruction for it.
//
// The projection belongs to `@receptron/sharedapp` and is tested there. What is pinned here is the
// JOIN this repository owns: which tiers publish a `{tier}/live:config` document at all, and — read
// the other way — which tiers the sweep is allowed to take away.
//
// The failure it guards against is the quiet one in both directions. Deleting on "no views" leaves
// a staff duty published beside no `write` projection, so the brief asks for an approval nothing
// can say is legal. Never deleting leaves a member's `write` readable by everyone the tier admits
// after the author dropped the desk page and believed the playbook went with it.
//
// Design: plans/feat-shared-app-agents.md
import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AuthoredAppZ, type AuthoredApp, type PublishStamp } from "@receptron/sharedapp";
import { planAppViewTiers } from "../../../server/backends/sharedApp/appViews.js";
import { makeTempDir } from "../../support/tempDir";

const OWNER = "owner@salon.jp";
const STAMP: PublishStamp = { uid: "uid_owner", email: OWNER, publishedAt: 1_700_000_000_000 };

const DESK = {
  id: "desk",
  audience: "member",
  watch: ["bookings"],
  instruction: "pending の予約は、枠が空いていれば承認する。",
};

/** A salon with a desk DUTY, and — depending on the case — a desk PAGE. Parsed through
 *  `AuthoredAppZ` rather than cast, so nothing publish would refuse can be asserted about here. */
const salon = (overrides: Record<string, unknown>): AuthoredApp =>
  AuthoredAppZ.parse({
    aid: "11111111-2222-3333-4444-555555555555",
    members: { [OWNER]: { "*": "owner" } },
    collections: { bookings: { submitOnly: true, statusField: "status", transitions: { initial: ["pending"], pending: ["approved"] } } },
    public: {
      submit: { bookings: { auth: "verifiedEmail", emailField: "email", createFields: ["email", "startAt", "status"], initialStatus: "pending" } },
    },
    ...overrides,
  });

const planFor = async (root: string, overrides: Record<string, unknown>, tier: "member" | "roster") => {
  const planned = await planAppViewTiers(root, salon(overrides), STAMP);
  if (!planned.ok) throw new Error(`refused: ${planned.problems.join(" ")}`);
  return planned.plans.find((plan) => plan.tier === tier);
};

describe("a tier with a standing instruction and no pages", () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir("mt-app-agents-");
    mkdirSync(path.join(root, "views"), { recursive: true });
    writeFileSync(path.join(root, "views", "desk.html"), "<p>desk</p>");
  });

  it("publishes the tier config the duty needs, with no page anywhere", async () => {
    const plan = await planFor(root, { agents: [DESK] }, "member");
    expect(plan?.pages).toEqual([]);
    // The document is written BECAUSE of the agent. Without it the desk brief would be published
    // beside no transition table, and "approve it" would be a job with nothing behind it.
    expect(plan?.config).not.toBeNull();
    expect(plan?.config?.agents).toEqual([{ id: "desk", instruction: DESK.instruction, watch: ["bookings"] }]);
    expect((plan?.config?.write as { cid: string }[]).map((entry) => entry.cid)).toEqual(["bookings"]);
  });

  it("keeps the tier when the last page is withdrawn but the duty stays", async () => {
    const plan = await planFor(root, { agents: [DESK], views: [] }, "member");
    expect(plan?.config).not.toBeNull();
  });

  it("takes the tier away when the pages AND the duty are gone", async () => {
    // "No views" used to be the whole condition, and after this it is not: the config document is
    // readable by everyone the tier admits, forever, so the sweep has to still fire here.
    const plan = await planFor(root, {}, "member");
    expect(plan?.config).toBeNull();
  });

  it("leaves the other audience's tier alone", async () => {
    const plan = await planFor(root, { agents: [DESK] }, "roster");
    expect(plan?.config).toBeNull();
  });

  it("publishes a page's tier as before when the app declares no duty at all", async () => {
    const views = [{ id: "desk", audience: "member", path: "views/desk.html", collections: ["bookings"] }];
    const plan = await planFor(root, { views }, "member");
    expect(plan?.pages.map((page) => page.id)).toEqual(["desk"]);
    expect(plan?.config).not.toBeNull();
    // Absent, not empty: an app that never declared one must publish the document it published
    // before this key existed.
    const config = plan?.config ?? {};
    expect("agents" in config).toBe(false);
  });
});
