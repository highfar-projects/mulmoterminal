# Choose the language a build reports in (#2634)

What the agent writes to the person — reports, questions, replies — is in the language the build records
(`run.language`, `personLanguageLine` in the step prompt). Until now that was always the screen's language, so a person
could not get reports in another one: someone polishing an English document on an English screen got English, and
someone who wanted Japanese reports had to switch the whole UI.

- The new-build form gets a "report language" select next to the usecase and base, starting as the screen's language,
  with each language named in its own words (`PERSON_LANGUAGE_NAMES` in `common/blueprint/personLanguage.ts`, so a
  person can find theirs whatever the screen shows). The start request sends the pick; the server already accepts any
  `personLanguageSchema` value.
- Documents keep their own language: the prompt line already says not to translate a document, a quotation or an
  app's text.

The other half of #2634 — the interview itself in English (labels, reasons and option text per locale, with the
values the checks compare kept as they are) — is the next change.
