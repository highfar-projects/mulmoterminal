// @vitest-environment node
// Placing an example's sample documents: copy what is missing, leave an identical file alone, and never
// overwrite a file of the same name with other content.
import { describe, expect, it } from "vitest";
import { SAMPLE_NAME_RE, samplePlan } from "../../../common/blueprint/samples";

const sample = (name: string, content = name) => ({ name, content });

describe("samplePlan", () => {
  it("copies what is missing, keeps what is identical, and names a clash", () => {
    const plan = samplePlan([sample("a.md"), sample("b.md"), sample("c.md")], { "b.md": "b.md", "c.md": "someone else's" });
    expect(plan).toEqual({ copy: [sample("a.md")], present: ["b.md"], clashes: ["c.md"] });
  });

  it("has nothing to do without samples", () => {
    expect(samplePlan([], { "a.md": "x" })).toEqual({ copy: [], present: [], clashes: [] });
  });

  it("treats an empty file of the same name as a clash, not as missing", () => {
    expect(samplePlan([sample("a.md")], { "a.md": "" }).clashes).toEqual(["a.md"]);
  });
});

describe("SAMPLE_NAME_RE", () => {
  it.each(["contract.txt", "keihi.md", "tehon-1.md", "旅程表.md", "a_b.txt"])("accepts %s", (name) => expect(SAMPLE_NAME_RE.test(name)).toBe(true));
  it.each([".hidden", "../x.md", "dir/x.md", "", "-x.md", "a b.md"])("refuses %j", (name) => expect(SAMPLE_NAME_RE.test(name)).toBe(false));
});
