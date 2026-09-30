// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  acceptedAnswers,
  defaultAnswers,
  requiredDefaults,
  answerProblems,
  hearingSchema,
  recordsWanted,
  sourceQuestion,
  unansweredQuestions,
  askedQuestions,
  folderAnswers,
  missingPathProblems,
  neededPaths,
  offeredOptions,
  settledAnswers,
  type Hearing,
  type HearingAnswers,
} from "../../../common/blueprint/hearing";

const hearing: Hearing = hearingSchema.parse({
  questions: [
    { id: "domain", label: "Domain", why: "who may sign in", kind: "text" },
    { id: "external", label: "External users?", why: "changes the usecase", kind: "boolean" },
    { id: "externalWho", label: "Who?", why: "scope", kind: "text", showIf: { id: "external", equals: true } },
    { id: "roles", label: "Roles", why: "claims", kind: "multiselect", options: ["member", "admin"] },
    { id: "note", label: "Anything else", why: "free", kind: "text", required: false },
  ],
});

const ids = (answers: HearingAnswers) => unansweredQuestions(hearing, answers).map((q) => q.id);

describe("unansweredQuestions", () => {
  it("asks every required, unconditional question when nothing is known", () => {
    expect(ids({})).toEqual(["domain", "external", "roles"]);
  });

  it("asks only the gaps of a supplied spec", () => {
    expect(ids({ domain: "example.com", roles: ["admin"] })).toEqual(["external"]);
  });

  it("asks a conditional question once its condition holds", () => {
    expect(ids({ domain: "example.com", external: true, roles: ["member"] })).toEqual(["externalWho"]);
  });

  it("does not ask a conditional question when the condition fails", () => {
    expect(ids({ domain: "example.com", external: false, roles: ["member"] })).toEqual([]);
  });

  it("treats blank strings and empty selections as unanswered", () => {
    expect(ids({ domain: "   ", external: false, roles: [] })).toEqual(["domain", "roles"]);
  });

  it("counts false and zero as answers", () => {
    const numeric = hearingSchema.parse({ questions: [{ id: "users", label: "Users", why: "size", kind: "number" }] });
    expect(unansweredQuestions(numeric, { users: 0 })).toEqual([]);
  });
});

describe("askedQuestions", () => {
  const askedIds = (h: Hearing, answers: HearingAnswers) => askedQuestions(h, answers).map((q) => q.id);

  it("compares the condition strictly", () => {
    expect(askedIds(hearing, { external: "true" })).not.toContain("externalWho");
    expect(askedIds(hearing, { external: true })).toContain("externalWho");
  });

  // q1 -> q2 -> q3: a stale answer to q2 must not open q3 once q2 itself is no longer asked.
  const chain = hearingSchema.parse({
    questions: [
      { id: "q1", label: "q1", why: "w", kind: "boolean" },
      { id: "q2", label: "q2", why: "w", kind: "boolean", showIf: { id: "q1", equals: true } },
      { id: "q3", label: "q3", why: "w", kind: "text", showIf: { id: "q2", equals: true } },
    ],
  });

  it("follows a chain of conditions", () => {
    expect(askedIds(chain, { q1: true, q2: true })).toEqual(["q1", "q2", "q3"]);
  });

  it("closes the whole chain when its head is closed, whatever stale answers remain", () => {
    expect(askedIds(chain, { q1: false, q2: true })).toEqual(["q1"]);
    expect(unansweredQuestions(chain, { q1: false, q2: true }).map((q) => q.id)).toEqual([]);
  });
});

describe("hearingSchema", () => {
  const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, why: "w", kind: "text", ...extra });

  it.each([
    ["duplicate ids", [q("a"), q("a")]],
    ["a select with no options", [q("a", { kind: "select" })]],
    ["a condition on a later question", [q("a", { showIf: { id: "b", equals: true } }), q("b")]],
    ["a condition on itself", [q("a", { showIf: { id: "a", equals: true } })]],
    ["a condition on an unknown question", [q("a", { showIf: { id: "zzz", equals: 1 } })]],
    ["no questions", []],
    ["a missing why", [{ id: "a", label: "a", kind: "text" }]],
    ["a one-per-line answer that is not text", [q("a", { kind: "select", options: ["x"], lines: true })]],
    ["a one-per-line number", [q("a", { kind: "number", lines: true })]],
    ["files to pick that are not one per line", [q("a", { pick: "files" })]],
    ["an unknown kind of pick", [q("a", { lines: true, pick: "folders" })]],
    ["a collection to pick that is one per line", [q("a", { lines: true, pick: "collection" })]],
    ["a collection to pick that is not text", [q("a", { kind: "select", options: ["x"], pick: "collection" })]],
    ["two collections to pick from", [q("a", { pick: "collection" }), q("b", { pick: "collection" })]],
    ["a records question that is not yes or no", [q("a", { pick: "collection" }), q("b", { pick: "records" })]],
    ["a records question with no collection to take them from", [q("b", { kind: "boolean", pick: "records" })]],
    ["two records questions", [q("a", { pick: "collection" }), q("b", { kind: "boolean", pick: "records" }), q("c", { kind: "boolean", pick: "records" })]],
  ])("rejects %s", (_label, questions) => {
    expect(hearingSchema.safeParse({ questions }).success).toBe(false);
  });

  it("takes one collection to pick, as one line of text, and names it as the source", () => {
    const parsed = hearingSchema.parse({ questions: [q("name"), q("from", { pick: "collection" })] });
    expect(sourceQuestion(parsed)?.id).toBe("from");
  });

  it("copies the records only on a yes to the records question", () => {
    const parsed = hearingSchema.parse({ questions: [q("from", { pick: "collection" }), q("keep", { kind: "boolean", pick: "records" })] });
    expect([true, false, "true", undefined].map((keep) => recordsWanted(parsed, keep === undefined ? {} : { keep }))).toEqual([true, false, false, false]);
    expect(recordsWanted(hearingSchema.parse({ questions: [q("from", { pick: "collection" })] }), { from: "books" })).toBe(false);
  });

  it("has no source when no question picks a collection", () => {
    expect(sourceQuestion(hearingSchema.parse({ questions: [q("a"), q("b", { lines: true, pick: "files" })] }))).toBeUndefined();
  });

  it("defaults required to true", () => {
    expect(hearingSchema.parse({ questions: [q("a")] }).questions[0].required).toBe(true);
  });

  it("takes a text answer as one per line only when it says so", () => {
    const [plain, list] = hearingSchema.parse({ questions: [q("a"), q("b", { lines: true })] }).questions;
    expect([plain?.lines, list?.lines]).toEqual([false, true]);
  });
});

describe("answerProblems", () => {
  const typed = hearingSchema.parse({
    questions: [
      { id: "t", label: "t", why: "w", kind: "text" },
      { id: "n", label: "n", why: "w", kind: "number" },
      { id: "b", label: "b", why: "w", kind: "boolean" },
      { id: "s", label: "s", why: "w", kind: "select", options: ["a", "b"] },
      { id: "m", label: "m", why: "w", kind: "multiselect", options: ["a", "b"] },
      { id: "hidden", label: "h", why: "w", kind: "number", showIf: { id: "b", equals: true } },
    ],
  });
  const good: HearingAnswers = { t: "x", n: 0, b: false, s: "a", m: ["a", "b"] };

  it("accepts answers of the right kind", () => {
    expect(answerProblems(typed, good)).toEqual([]);
  });

  it.each([
    ["text given a number", { t: 3 }, "t: expects text"],
    ["a number given text", { n: "3" }, "n: expects a number"],
    ["a boolean given text", { b: "true" }, "b: expects yes or no"],
    ["a select given an unknown option", { s: "c" }, "s: expects one of its options"],
    ["a select given a list", { s: ["a"] }, "s: expects one of its options"],
    ["a multiselect with an unknown option", { m: ["a", "z"] }, "m: expects some of its options"],
    ["a multiselect given one string", { m: "a" }, "m: expects some of its options"],
  ])("refuses %s", (_label, patch, problem) => {
    expect(answerProblems(typed, { ...good, ...patch })).toEqual([problem]);
  });

  it("ignores a wrong answer to a question that is not asked", () => {
    expect(answerProblems(typed, { ...good, hidden: "x" })).toEqual([]);
  });
});

describe("acceptedAnswers", () => {
  it("keeps each answer its question takes, whether or not the question is asked right now", () => {
    const answers: HearingAnswers = { domain: "example.com", external: false, externalWho: "partners", roles: ["admin"] };
    expect(acceptedAnswers(hearing, answers)).toEqual(answers);
  });

  it("drops an answer to no question, of the wrong kind, or naming a choice the question does not offer", () => {
    expect(acceptedAnswers(hearing, { domain: "example.com", gone: "x", external: "yes", roles: ["owner"] })).toEqual({ domain: "example.com" });
    expect(acceptedAnswers(hearing, { roles: "admin" })).toEqual({});
    expect(acceptedAnswers(hearing, {})).toEqual({});
  });
});

describe("a question's default", () => {
  const withDefault = (question: Record<string, unknown>) => hearingSchema.safeParse({ questions: [{ id: "q", label: "Q", why: "w", ...question }] });

  it("is taken when the question would take it as an answer", () => {
    expect(withDefault({ kind: "number", default: 5 }).success).toBe(true);
    expect(withDefault({ kind: "select", options: ["a", "b"], default: "b" }).success).toBe(true);
    expect(withDefault({ kind: "multiselect", options: ["a", "b"], default: ["a"] }).success).toBe(true);
    expect(withDefault({ kind: "boolean", default: false }).success).toBe(true);
  });

  it("is refused when the question would refuse it, so a pack cannot ship one", () => {
    expect(withDefault({ kind: "number", default: "5" }).success).toBe(false);
    expect(withDefault({ kind: "select", options: ["a", "b"], default: "c" }).success).toBe(false);
    expect(withDefault({ kind: "multiselect", options: ["a"], default: "a" }).success).toBe(false);
    expect(withDefault({ kind: "boolean", default: 0 }).success).toBe(false);
  });

  it("fills the answers an interview starts with, only for the questions that have one", () => {
    const parsed = hearingSchema.parse({
      questions: [
        { id: "limit", label: "L", why: "w", kind: "number", default: 5 },
        { id: "note", label: "N", why: "w", kind: "text" },
        { id: "on", label: "O", why: "w", kind: "boolean", default: false },
        { id: "extra", label: "E", why: "w", kind: "text", required: false, default: "none" },
      ],
    });
    expect(defaultAnswers(parsed)).toEqual({ limit: 5, on: false, extra: "none" });
    expect(requiredDefaults(parsed)).toEqual({ limit: 5, on: false });
    expect(defaultAnswers(hearing)).toEqual({});
  });
});

describe("an option that needs a file in the folder", () => {
  const FOLDER = "this folder's rules";
  const DEFAULT = "chaff's default";
  const styled: Hearing = hearingSchema.parse({
    questions: [
      { id: "style", label: "Style", why: "which rules", kind: "select", options: [FOLDER, DEFAULT], needsPath: { [FOLDER]: "chaff.yaml" } },
      { id: "kind", label: "Kind", why: "genre", kind: "select", options: ["report", "blog"], showIf: { id: "style", equals: DEFAULT } },
    ],
  });
  const has =
    (...files: string[]) =>
    (file: string) =>
      files.includes(file);
  const style = styled.questions[0];

  it("is offered only when the folder has the file", () => {
    if (!style) throw new Error("no style question");
    expect(offeredOptions(style, has("chaff.yaml"))).toEqual([FOLDER, DEFAULT]);
    expect(offeredOptions(style, has())).toEqual([DEFAULT]);
    expect(offeredOptions(style, has("STYLE.md"))).toEqual([DEFAULT]);
  });

  it("settles a question left with one option, and none that still has a choice", () => {
    expect(settledAnswers(styled, has())).toEqual({ style: DEFAULT });
    expect(settledAnswers(styled, has("chaff.yaml"))).toEqual({});
  });

  it("drops an answer the folder cannot offer and keeps every other", () => {
    expect(folderAnswers(styled, { style: FOLDER, other: "x" }, has())).toEqual({ style: DEFAULT, other: "x" });
    expect(folderAnswers(styled, { style: FOLDER }, has("chaff.yaml"))).toEqual({ style: FOLDER });
    expect(folderAnswers(styled, { style: DEFAULT, kind: "blog" }, has())).toEqual({ style: DEFAULT, kind: "blog" });
    expect(folderAnswers(styled, {}, has("chaff.yaml"))).toEqual({});
    const three = hearingSchema.parse({
      questions: [{ id: "voice", label: "Voice", why: "tone", kind: "select", options: ["mine", "polite", "plain"], needsPath: { mine: "VOICE.md" } }],
    });
    expect(folderAnswers(three, { voice: "mine" }, has())).toEqual({});
    expect(folderAnswers(three, { voice: "polite" }, has())).toEqual({ voice: "polite" });
  });

  it("names an answer whose file is missing, only when that question is asked", () => {
    expect(missingPathProblems(styled, { style: FOLDER }, has())).toHaveLength(1);
    expect(missingPathProblems(styled, { style: FOLDER }, has("chaff.yaml"))).toEqual([]);
    expect(missingPathProblems(styled, { style: DEFAULT }, has())).toEqual([]);
  });

  it("offers an option that needs several files only when every one is there", () => {
    const both = hearingSchema.parse({
      questions: [
        { id: "style", label: "Style", why: "which", kind: "select", options: [FOLDER, DEFAULT], needsPath: { [FOLDER]: ["STYLE.md", "chaff.yaml"] } },
      ],
    });
    expect(settledAnswers(both, has("STYLE.md", "chaff.yaml"))).toEqual({});
    expect(settledAnswers(both, has("chaff.yaml"))).toEqual({ style: DEFAULT });
    expect(settledAnswers(both, has("STYLE.md"))).toEqual({ style: DEFAULT });
    expect(missingPathProblems(both, { style: FOLDER }, has("chaff.yaml"))).toEqual([`style: 「${FOLDER}」 needs STYLE.md in the folder, and it has none`]);
    expect(missingPathProblems(both, { style: FOLDER }, has())[0]).toContain("STYLE.md and chaff.yaml");
    expect(folderAnswers(both, { style: FOLDER }, has("STYLE.md"))).toEqual({ style: DEFAULT });
    expect(neededPaths(both)).toEqual(["STYLE.md", "chaff.yaml"]);
  });

  it("lists each needed file once", () => {
    expect(neededPaths(styled)).toEqual(["chaff.yaml"]);
    expect(neededPaths(hearing)).toEqual([]);
  });

  it.each([
    ["an option the question does not have", { needsPath: { other: "chaff.yaml" } }],
    ["a path from the root", { needsPath: { [FOLDER]: "/etc/chaff.yaml" } }],
    ["a path out of the folder", { needsPath: { [FOLDER]: "../chaff.yaml" } }],
    ["an empty segment", { needsPath: { [FOLDER]: "a//chaff.yaml" } }],
    ["a backslash", { needsPath: { [FOLDER]: "a\\chaff.yaml" } }],
    ["one bad path among several", { needsPath: { [FOLDER]: ["STYLE.md", "../chaff.yaml"] } }],
    ["no files at all", { needsPath: { [FOLDER]: [] } }],
    ["a question that is not a select", { kind: "multiselect", needsPath: { [FOLDER]: "chaff.yaml" } }],
  ])("refuses a hearing naming %s", (_name, patch) => {
    const question = { id: "style", label: "Style", why: "which", kind: "select", options: [FOLDER, DEFAULT], ...patch };
    expect(hearingSchema.safeParse({ questions: [question] }).success).toBe(false);
  });

  it("accepts a path inside a folder", () => {
    const question = { id: "style", label: "Style", why: "which", kind: "select", options: [FOLDER, DEFAULT], needsPath: { [FOLDER]: "rules/chaff.yaml" } };
    expect(hearingSchema.safeParse({ questions: [question] }).success).toBe(true);
  });
});
