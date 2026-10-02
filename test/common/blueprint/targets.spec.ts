// @vitest-environment node
import { describe, it, expect } from "vitest";
import { basePlanSchema } from "../../../common/blueprint/plan";
import { initialState, type BlueprintState, type StepStatus } from "../../../common/blueprint/state";
import { isPullRequestUrl, targetRows, targetsViewOf, type Target } from "../../../common/blueprint/targets";

const steps = basePlanSchema.parse({
  steps: [
    { id: "survey", title: "survey", skill: "s", check: "true" },
    { id: "tranche", title: "tranche", skill: "s", check: "true", repeatWhile: "true" },
    { id: "report", title: "report", skill: "s", check: "true" },
  ],
}).steps;

const target = (id: string, status: Target["status"]): Target => ({ id, title: id, files: [], status });

const at = (statuses: Partial<Record<string, StepStatus>>): BlueprintState => {
  const state = initialState(steps);
  return { steps: Object.fromEntries(Object.entries(state.steps).map(([id, step]) => [id, { ...step, status: statuses[id] ?? step.status }])) };
};

describe("targetsViewOf — reading the file", () => {
  it("is no list at all when the build has not written one", () => {
    expect(targetsViewOf(null)).toEqual({ targets: null, problem: null });
  });

  it("reads the list, dropping fields it does not know and defaulting the files", () => {
    const raw = JSON.stringify({
      targets: [
        { id: "a", title: "A", status: "todo", extra: 1 },
        { id: "b", title: "B", kind: "test", files: ["x.ts"], status: "done", pr: "u" },
      ],
    });
    expect(targetsViewOf(raw)).toEqual({
      targets: [
        { id: "a", title: "A", files: [], status: "todo" },
        { id: "b", title: "B", kind: "test", files: ["x.ts"], status: "done", pr: "u" },
      ],
      problem: null,
    });
  });

  it("shows an empty list as empty, not as missing", () => {
    expect(targetsViewOf('{"targets":[]}')).toEqual({ targets: [], problem: null });
  });

  it.each([
    ["text that is not JSON", "{", ".blueprint/targets.json is not JSON"],
    ["the too-large notice the file reader returns", "(.blueprint/targets.json is 9 bytes, too large to show)", ".blueprint/targets.json is not JSON"],
    ["JSON with no list", "{}", ".blueprint/targets.json does not hold a list of targets"],
    ["a target with an unknown status", '{"targets":[{"id":"a","title":"A","status":"doing"}]}', ".blueprint/targets.json does not hold a list of targets"],
    ["a target with no title", '{"targets":[{"id":"a","status":"todo"}]}', ".blueprint/targets.json does not hold a list of targets"],
    ["null", "null", ".blueprint/targets.json does not hold a list of targets"],
  ])("reports %s instead of throwing", (_label, raw, problem) => {
    expect(targetsViewOf(raw)).toEqual({ targets: null, problem });
  });
});

describe("isPullRequestUrl — what becomes a link", () => {
  it.each(["https://github.com/receptron/mulmoterminal/pull/2854", "https://github.com/a/b/pull/1"])("links %s", (url) => {
    expect(isPullRequestUrl(url)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "javascript:alert(1)",
    "ssh://github.com/a/b/pull/1",
    // Built rather than written: the insecure scheme is the input under test, and the linter rightly flags the literal.
    "https://github.com/a/b/pull/1".replace("https", "http"),
    "https://github.com.evil.example/a/b/pull/1",
    "https://github.com/a/b/issues/1",
    "https://github.com/a/b/pull/1/files",
    "https://github.com/a/b/pull/1 ",
  ])("does not link %j", (url) => {
    expect(isPullRequestUrl(url)).toBe(false);
  });
});

describe("targetRows — where each target stands", () => {
  const list = [target("a", "done"), target("b", "skipped"), target("c", "todo"), target("d", "todo")];

  it("keeps the order and numbers from one", () => {
    expect(targetRows(list, steps, at({})).map(({ target: { id }, position }) => [id, position])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ]);
  });

  it("marks the first target still to do while the repeating step runs", () => {
    expect(targetRows(list, steps, at({ survey: "passed", tranche: "running" })).map((row) => row.phase)).toEqual(["done", "skipped", "working", "todo"]);
  });

  it("marks it as needing a decision while the repeating step waits for an answer", () => {
    expect(targetRows(list, steps, at({ survey: "passed", tranche: "awaiting-answer" })).map((row) => row.phase)).toEqual([
      "done",
      "skipped",
      "needs-decision",
      "todo",
    ]);
  });

  it.each<[string, Partial<Record<string, StepStatus>>]>([
    ["the survey writing the list", { survey: "running" }],
    ["the survey asking a question", { survey: "awaiting-answer" }],
    ["the repeating step stopped on a failure", { survey: "passed", tranche: "failed" }],
    ["the repeating step not started", { survey: "passed", tranche: "pending" }],
    ["the step after it", { survey: "passed", tranche: "passed", report: "running" }],
  ])("marks nothing as worked on during %s", (_label, statuses) => {
    expect(targetRows(list, steps, at(statuses)).map((row) => row.phase)).toEqual(["done", "skipped", "todo", "todo"]);
  });

  it("marks nothing when no target is left to do", () => {
    const finished = [target("a", "done"), target("b", "skipped")];
    expect(targetRows(finished, steps, at({ survey: "passed", tranche: "running" })).map((row) => row.phase)).toEqual(["done", "skipped"]);
  });

  it("is empty for an empty list", () => {
    expect(targetRows([], steps, at({ survey: "passed", tranche: "running" }))).toEqual([]);
  });
});
