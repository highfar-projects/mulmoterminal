// Every screen language is one a build can record, so a person on any of them gets reports in it.
import { describe, it, expect } from "vitest";
import { UI_LOCALES } from "../../../../src/composables/uiLanguage";
import { PERSON_LANGUAGE_NAMES, personLanguageSchema } from "../../../../common/blueprint/personLanguage";

describe("the languages a build records", () => {
  it("are the screen's languages", () => {
    expect([...personLanguageSchema.options].sort()).toEqual(UI_LOCALES.map((locale) => locale.code).sort());
  });

  it("each have a name the person can pick them by", () => {
    expect(Object.keys(PERSON_LANGUAGE_NAMES).sort()).toEqual([...personLanguageSchema.options].sort());
  });
});
