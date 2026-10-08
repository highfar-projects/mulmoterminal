// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseListParam } from "../../../../server/backends/collections/viewDataParams.js";

describe("parseListParam", () => {
  it("splits a comma list and trims each entry", () => {
    expect(parseListParam("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("accepts a repeated param", () => {
    expect(parseListParam(["a", " b"])).toEqual(["a", "b"]);
  });

  it("drops empty entries", () => {
    expect(parseListParam("a,,b,")).toEqual(["a", "b"]);
  });

  it("is undefined when nothing is left, so the read is not narrowed", () => {
    expect(parseListParam("")).toBeUndefined();
    expect(parseListParam(" , ,")).toBeUndefined();
    expect(parseListParam([])).toBeUndefined();
  });

  it("is undefined for an absent or non-list value", () => {
    expect(parseListParam(undefined)).toBeUndefined();
    expect(parseListParam(null)).toBeUndefined();
    expect(parseListParam(42)).toBeUndefined();
    expect(parseListParam({ a: "b" })).toBeUndefined();
  });
});
