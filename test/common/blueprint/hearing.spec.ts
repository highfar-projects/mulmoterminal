// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  acceptedAnswers,
  answerProblems,
  hearingSchema,
  sourceQuestion,
  unansweredQuestions,
  askedQuestions,
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
  ])("rejects %s", (_label, questions) => {
    expect(hearingSchema.safeParse({ questions }).success).toBe(false);
  });

  it("takes one collection to pick, as one line of text, and names it as the source", () => {
    const parsed = hearingSchema.parse({ questions: [q("name"), q("from", { pick: "collection" })] });
    expect(sourceQuestion(parsed)?.id).toBe("from");
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
