// @vitest-environment node
import { describe, it, expect } from "vitest";
import { describeRoles, removalLines, removalRefusal, rosterRemovals } from "../../../server/backends/sharedApp/rosterRemovals.js";

const OWNER = "owner@example.com";
const live = (members: unknown): Record<string, unknown> => ({ aid: "a", members });

describe("rosterRemovals", () => {
  it("names each address the live roster has and app.json does not, with its roles", () => {
    const removals = rosterRemovals(live({ [OWNER]: { "*": "owner" }, "b@example.com": { "*": "viewer" }, "a@example.com": { tasks: "assignee" } }), {
      [OWNER]: { "*": "owner" },
    });
    expect(removals).toEqual([
      { email: "a@example.com", roles: { tasks: "assignee" } },
      { email: "b@example.com", roles: { "*": "viewer" } },
    ]);
  });

  it("names nobody when app.json keeps everyone, or adds people", () => {
    expect(rosterRemovals(live({ [OWNER]: { "*": "owner" } }), { [OWNER]: { "*": "owner" } })).toEqual([]);
    expect(rosterRemovals(live({ [OWNER]: { "*": "owner" } }), { [OWNER]: { "*": "owner" }, "new@example.com": { "*": "editor" } })).toEqual([]);
  });

  // A role change keeps the address, so it is not a removal: the person keeps access.
  it("does not count a role change as a removal", () => {
    expect(
      rosterRemovals(live({ [OWNER]: { "*": "owner" }, "b@example.com": { "*": "editor" } }), {
        [OWNER]: { "*": "owner" },
        "b@example.com": { "*": "viewer" },
      }),
    ).toEqual([]);
  });

  it("has nothing to compare when there is no live app, or its roster is not a map", () => {
    expect(rosterRemovals(null, { [OWNER]: { "*": "owner" } })).toEqual([]);
    expect(rosterRemovals({ aid: "a" }, { [OWNER]: { "*": "owner" } })).toEqual([]);
    expect(rosterRemovals(live(null), {})).toEqual([]);
    expect(rosterRemovals(live(["x"]), {})).toEqual([]);
    expect(rosterRemovals(live("x"), {})).toEqual([]);
  });

  // `in` would find `constructor` on every object and hide a removal of that name; hasOwn does not.
  it("compares own keys only", () => {
    expect(rosterRemovals(live({ constructor: { "*": "viewer" } }), {})).toEqual([{ email: "constructor", roles: { "*": "viewer" } }]);
  });

  it("keeps only string roles from a live entry, and survives one that is not a map", () => {
    expect(rosterRemovals(live({ "b@example.com": { "*": "viewer", tasks: 3 } }), {})).toEqual([{ email: "b@example.com", roles: { "*": "viewer" } }]);
    expect(rosterRemovals(live({ "b@example.com": "viewer" }), {})).toEqual([{ email: "b@example.com", roles: {} }]);
  });
});

describe("describeRoles", () => {
  it("says an app-wide role plainly and a collection role with its collection", () => {
    expect(describeRoles({ "*": "editor" })).toBe("editor");
    expect(describeRoles({ tasks: "assignee" })).toBe("assignee on tasks");
    expect(describeRoles({ "*": "viewer", tasks: "assignee" })).toBe("viewer, assignee on tasks");
    expect(describeRoles({})).toBe("no role");
  });
});

describe("removalRefusal", () => {
  const removals = [{ email: "b@example.com", roles: { "*": "viewer" } }];

  it("goes ahead when nobody is removed, whatever the consent", () => {
    expect(removalRefusal([], undefined)).toBeNull();
    expect(removalRefusal([], false)).toBeNull();
  });

  it("goes ahead only with confirmRemovals === true", () => {
    expect(removalRefusal(removals, true)).toBeNull();
    expect(removalRefusal(removals, false)).not.toBeNull();
    expect(removalRefusal(removals, undefined)).not.toBeNull();
  });

  it("names each person and says how to proceed either way", () => {
    const text = (removalRefusal(removals, undefined) ?? []).join("\n");
    expect(text).toContain("b@example.com (viewer)");
    expect(text).toContain("confirmRemovals: true");
    expect(text).toContain("`invite`");
  });

  it("counts people in the singular and the plural", () => {
    expect(removalLines(removals)[0]).toContain("1 person ");
    expect(removalLines([...removals, { email: "c@example.com", roles: {} }])[0]).toContain("2 people ");
  });
});
