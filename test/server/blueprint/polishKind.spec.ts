// @vitest-environment node
// The kinds of document polish offers, and the genre chaff measures each by. The interview's options are the
// kinds' options, word for word: an option the list does not know would measure by no genre at all.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAFF_DEFAULT_STYLE, genreArgs, genreOf, readKinds } from "../../../blueprints/polish/checks/kind.mjs";
import { PACKS } from "./docsPackHarness";

// `npx chaffjs@0.16 genres`. A kind naming a genre chaff lacks stops every chaff run of the build (chaff refuses an
// unknown genre), so a genre renamed upstream shows here first.
const CHAFF_GENRES = [
  "technical/spec",
  "technical/readme",
  "blog/tech",
  "blog/essay",
  "blog/owned-media",
  "business/proposal",
  "business/report",
  "business/email",
  "business/press-release",
  "business/meeting-notes",
  "legal/contract",
  "legal/statute",
  "legal/judgment",
  "legal/patent",
  "docs/manual",
  "docs/faq",
  "docs/glossary",
  "academic/paper",
  "literature/fiction",
  "literature/essay",
  "literature/poetry",
  "literature/play",
  "speech/address",
  "speech/transcript",
];

const kinds = readKinds(join(PACKS, "polish"));
const hearing = JSON.parse(readFileSync(join(PACKS, "polish", "hearing.json"), "utf8"));
const kindQuestion = hearing.questions.find((question: { id: string }) => question.id === "kind");

describe("polish: the kinds of document", () => {
  it("are the interview's options, in its order, with the one left to chaff first and the default", () => {
    expect(kindQuestion.options).toEqual(kinds.map((kind) => kind.option));
    expect(kindQuestion.default).toBe(kinds[0]?.option);
    expect(kinds[0]?.genre).toBeNull();
    expect(kindQuestion.showIf).toEqual({ id: "style", equals: CHAFF_DEFAULT_STYLE });
  });

  it("each name a genre chaff has, each only once", () => {
    const genres = kinds.flatMap((kind) => (kind.genre === null ? [] : [kind.genre]));
    genres.forEach((genre) => expect(CHAFF_GENRES).toContain(genre));
    expect(new Set(genres).size).toBe(genres.length);
  });

  it("picks the genre only with chaff's own style", () => {
    expect(genreOf({ style: CHAFF_DEFAULT_STYLE, kind: "報告書" }, kinds)).toBe("business/report");
    expect(genreOf({ style: CHAFF_DEFAULT_STYLE, kind: "議事録" }, kinds)).toBe("business/meeting-notes");
    expect(genreOf({ style: "このフォルダの規約（STYLE.md と chaff.yaml）", kind: "報告書" }, kinds)).toBeNull();
  });

  it.each([
    ["a kind left to chaff", { style: CHAFF_DEFAULT_STYLE, kind: "指定しない（chaff に任せる）" }],
    ["no kind", { style: CHAFF_DEFAULT_STYLE }],
    ["an unknown kind", { style: CHAFF_DEFAULT_STYLE, kind: "詩" }],
    ["a kind that is not text", { style: CHAFF_DEFAULT_STYLE, kind: 3 }],
    ["no answers", null],
    ["answers that are not an object", "報告書"],
  ])("picks none for %s", (_label, answers) => {
    expect(genreOf(answers, kinds)).toBeNull();
  });

  it("turns a genre into chaff's argument, and none into nothing", () => {
    expect(genreArgs("blog/tech")).toEqual(["--genre", "blog/tech"]);
    expect(genreArgs(null)).toEqual([]);
  });
});
