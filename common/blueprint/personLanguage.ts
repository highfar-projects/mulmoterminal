// The language the person reads, taken from the screen they started the build on: what the agent writes for them
// follows it, not the documents' language nor the interview's (whose options are Japanese whatever the screen shows).
import { z } from "zod";

/** The UI's locales. */
export const personLanguageSchema = z.enum(["en", "ja", "zh-CN", "zh-TW", "ko"]);
export type PersonLanguage = z.infer<typeof personLanguageSchema>;

/** The English name an agent is told. */
export const PERSON_LANGUAGES: Readonly<Record<PersonLanguage, string>> = {
  en: "English",
  ja: "Japanese",
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  ko: "Korean",
};

export const isPersonLanguage = (raw: string): raw is PersonLanguage => personLanguageSchema.safeParse(raw).success;

/** The prompt line that says it; none for a build started before the language was recorded. */
export const personLanguageLine = (language: PersonLanguage | null | undefined): string[] =>
  language
    ? [
        `The user reads ${PERSON_LANGUAGES[language]}. Write everything meant for them — reports, replies, the questions you ask — in ${PERSON_LANGUAGES[language]}, whatever language the documents or .blueprint/answers.json are in.`,
      ]
    : [];
