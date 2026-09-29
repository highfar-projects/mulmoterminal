# feat: the agent writes for the person in the language of their screen (#2634, part 2)

A verify build over an English itinerary, started from the Japanese options of the interview, came back
with a Japanese report. The report SKILLs say "for the person, in their language", and the only hint an
agent had of that language was `.blueprint/answers.json` — whose option values are Japanese whatever the
screen shows. A person using the app in English got the same Japanese report.

## Change

- `common/blueprint/personLanguage.ts`: the screen's languages (`en`, `ja`, `zh-CN`, `zh-TW`, `ko`) with
  the English name an agent is told, and the prompt line that says it.
- The new-build form sends the screen's language with the start; the route accepts only those codes
  (anything else is a 400 before a build is made); the run records it as `language` (`null` for records
  written before it).
- Every step's prompt, and the spec conversation's, carries "The user reads <language>. Write everything
  meant for them — reports, replies, the questions you ask — in <language>, whatever language the
  documents or .blueprint/answers.json are in." A build with no recorded language gets no line, so
  existing builds behave as before.

## Not in this change

Part 1 of #2634 — showing the interview itself in English — needs the option values separated from
their display words, because the checks compare the values as strings. That is a decision for the
person who owns the packs.

A spec pins the list to the screen's `UI_LOCALES`, so a sixth screen language that is not added here
fails the suite.
