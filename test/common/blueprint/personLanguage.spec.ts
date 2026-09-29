// The language an agent writes for the person in: one per screen language, said in the step's and the spec
// conversation's prompts, and not said at all for a build that never recorded one.
import { describe, it, expect } from "vitest";
import { isPersonLanguage, personLanguageLine, personLanguageSchema, PERSON_LANGUAGES } from "../../../common/blueprint/personLanguage";
import { stepPrompt } from "../../../common/blueprint/stepPrompt";
import { specRevisionPrompt } from "../../../common/blueprint/specRevisionPrompt";
import { blueprintRunSchema } from "../../../common/blueprint/run";

const step = { id: "report", title: "Report", description: "", skill: "skills/report", check: "true", gates: [], reads: [] };
const stepText = (language: "en" | "ja" | null) =>
  stepPrompt({ step, skillFile: "/p/SKILL.md", packDirs: { base: "/b", usecase: "/u" }, stepState: undefined, askCommand: "ASK", language });
const specText = (language: "ko" | null) =>
  specRevisionPrompt({ chat: [], message: "m", packDirs: { base: "/b", usecase: "/u" }, replyPath: "r.md", language });

describe("the person's language", () => {
  it("names each screen language, and nothing else", () => {
    expect(personLanguageSchema.options.map((code) => PERSON_LANGUAGES[code])).toEqual([
      "English",
      "Japanese",
      "Simplified Chinese",
      "Traditional Chinese",
      "Korean",
    ]);
    expect(isPersonLanguage("zh-TW")).toBe(true);
    expect(isPersonLanguage("fr")).toBe(false);
    expect(isPersonLanguage("")).toBe(false);
  });

  it("tells a step's agent to write for the person in it, over the documents' language", () => {
    expect(stepText("en")).toContain("The user reads English. Write everything meant for them");
    expect(stepText("en")).toContain("whatever language the documents or .blueprint/answers.json are in");
    expect(stepText("ja")).toContain("The user reads Japanese.");
  });

  it("says nothing when the build recorded no language", () => {
    expect(personLanguageLine(null)).toEqual([]);
    expect(personLanguageLine(undefined)).toEqual([]);
    expect(stepText(null)).not.toContain("The user reads");
  });

  it("tells the spec conversation's agent too", () => {
    expect(specText("ko")).toContain("The user reads Korean.");
    expect(specText(null)).not.toContain("The user reads");
  });

  it("reads a record written before the language was recorded as none, and refuses one it does not know", () => {
    const run = {
      id: "run-00000001",
      projectDir: "/p",
      basePackDir: "/b",
      usecasePackDir: "/u",
      steps: [{ ...step, origin: "usecase" }],
      failedChecks: {},
      activeSessionId: null,
      sessions: [],
      createdAtMs: 1,
    };
    expect(blueprintRunSchema.parse(run).language).toBeNull();
    expect(blueprintRunSchema.parse({ ...run, language: "en" }).language).toBe("en");
    expect(blueprintRunSchema.safeParse({ ...run, language: "fr" }).success).toBe(false);
  });
});
