# Offer "this folder's style" only where the folder has chaff.yaml (#2735)

## Problem

The write and polish interviews ask 「どの規約に合わせますか」 with 「このフォルダの規約（STYLE.md と chaff.yaml）」
first, in every folder. In a folder without chaff.yaml the choice cannot work, and a person who picks it gets a build
whose check fails later. Fewer, workable choices are easier (the same request as #2734).

## Design

- `needsFile` on a select question: `{ option: relative file or [files] }`; the option needs every one. The hearing schema refuses an option the question
  does not have, a path that leaves the folder, and `needsFile` on anything but a select.
- Pure helpers in `common/blueprint/hearing.ts`: `offeredOptions`, `settledAnswers` (a question left with one
  option is answered with it), `folderAnswers` (drop an unoffered answer, add the settled ones),
  `missingFileProblems`, `neededFiles`.
- Server: `GET /api/blueprints/folder-present?dir=&file=…` says which of the files are there (none for a folder not
  made yet). `POST /api/blueprints/runs` adds the settled answers and refuses (400) an answer whose file is missing.
- Form: asks the folder once typing pauses, hides a settled question, narrows the options, and sends the folder's
  answers. While the folder is unknown or could not be read, every option is offered and the server decides.
- `write` marks 「このフォルダの規約」 as needing STYLE.md and chaff.yaml (its brief check requires both). `polish`
  marks it as needing chaff.yaml only — a folder `adopt` set up has no STYLE.md and polishing against its chaff.yaml
  works — and marks 「手引き（STYLE.md）の決まりにも合わせる」 as needing STYLE.md.
- A link does not count as the file (`lstat`), as the folder's file list does not follow links.
- The missing-file refusal comes before the unanswered-question one: the refused option may open questions.

## Follow-up: a folder it cannot read

Only ENOENT and ENOTDIR mean the file is not there. Any other lookup error (EACCES on an unreadable folder) makes
`folder-present` answer 500, so the form treats the folder as unknown and offers every option instead of hiding one.
The create path needs no guard of its own: an unreadable folder is refused earlier, by the `.blueprint` check.
