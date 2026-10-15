// @vitest-environment node
import { describe, expect, it } from "vitest";
import { homeScopeSuffix } from "../../../server/config/home-scope.js";

const SUFFIX_RE = /^-[0-9a-f]{16}$/;

describe("homeScopeSuffix", () => {
  it("is empty on the account's own home, so existing tmux sessions keep reattaching", () => {
    expect(homeScopeSuffix("/Users/alice", "/Users/alice")).toBe("");
  });

  it("is empty when the two spell the same directory differently", () => {
    expect(homeScopeSuffix("/Users/alice/", "/Users/alice")).toBe("");
    expect(homeScopeSuffix("/Users/alice/./x/..", "/Users/alice")).toBe("");
  });

  it("is empty when the account home is unknown, rather than moving every session", () => {
    expect(homeScopeSuffix("/tmp/demo", null)).toBe("");
    expect(homeScopeSuffix("/tmp/demo", "")).toBe("");
  });

  it("names an overridden home with a short hash", () => {
    expect(homeScopeSuffix("/tmp/demo", "/Users/alice")).toMatch(SUFFIX_RE);
  });

  it("is stable for one home and differs between two", () => {
    const demo = homeScopeSuffix("/tmp/demo", "/Users/alice");
    expect(homeScopeSuffix("/tmp/demo/", "/Users/alice")).toBe(demo);
    expect(homeScopeSuffix("/tmp/demo2", "/Users/alice")).not.toBe(demo);
  });

  it("does not depend on which account it is compared against", () => {
    expect(homeScopeSuffix("/tmp/demo", "/Users/alice")).toBe(homeScopeSuffix("/tmp/demo", "/Users/bob"));
  });

  it("scopes a home nested under the account's own", () => {
    expect(homeScopeSuffix("/Users/alice/demo", "/Users/alice")).toMatch(SUFFIX_RE);
  });
});
