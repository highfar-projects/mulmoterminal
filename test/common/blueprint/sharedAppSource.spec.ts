// @vitest-environment node
// A shared app as a build's source: how the form names one, and whose role reads every record of which collection.
import { describe, expect, it } from "vitest";
import { APP_SOURCE_PREFIX, appIdOf, appSourceValue, collectionsNotFullyReadable } from "../../../common/blueprint/sharedAppSource";

describe("naming a shared app as the source", () => {
  it("round-trips a folder id, and reads a collection slug as no app", () => {
    expect(appSourceValue("f00d")).toBe(`${APP_SOURCE_PREFIX}f00d`);
    expect(appIdOf(appSourceValue("f00d"))).toBe("f00d");
    expect(appIdOf("books")).toBeNull();
    expect(appIdOf("application")).toBeNull();
  });
});

describe("collectionsNotFullyReadable", () => {
  const MANIFEST = {
    members: {
      "Owner@Example.com": { "*": "owner" },
      "mixed@example.com": { "*": "participant", ballots: "viewer", notes: "editor" },
      "assignee@example.com": { tasks: "assignee" },
      "odd@example.com": "owner",
    },
  };
  const CIDS = ["ballots", "notes", "tasks"];

  it("finds nothing unreadable for an app-wide owner, whatever the case of the address", () => {
    expect(collectionsNotFullyReadable(MANIFEST, "owner@example.com", CIDS)).toEqual([]);
  });

  it("takes a per-collection role over the app-wide one", () => {
    expect(collectionsNotFullyReadable(MANIFEST, "mixed@example.com", CIDS)).toEqual(["tasks"]);
  });

  it("counts a role that reads only part — assignee, participant — and no role at all, as not a full reader", () => {
    expect(collectionsNotFullyReadable(MANIFEST, "assignee@example.com", CIDS)).toEqual(CIDS);
    expect(collectionsNotFullyReadable(MANIFEST, "stranger@example.com", CIDS)).toEqual(CIDS);
  });

  it.each([[null], ["{}"], [{ members: [] }], [{ members: { "odd@example.com": "owner" } }], [{}]])("reads a malformed roster %j as no role", (manifest) => {
    expect(collectionsNotFullyReadable(manifest, "odd@example.com", ["ballots"])).toEqual(["ballots"]);
  });

  it("has nothing to refuse when there are no collections", () => {
    expect(collectionsNotFullyReadable(MANIFEST, "stranger@example.com", [])).toEqual([]);
  });
});
