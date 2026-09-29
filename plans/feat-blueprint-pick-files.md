# Blueprints: pick the documents from the folder

Issue: #2427

## Why

The document packs ask for files inside the build's folder, one per line, and the person had to type each relative path exactly. A typo was refused only after Start.

## Shape

- A one-per-line question may say its lines are files in the folder (`pick: "files"`); on a question that is not one per line it is a hearing problem. Marked on the documents of review, verify and ask, the targets of polish, and the sources of style and write. A pack spec pins it on every one-per-line question whose label says its lines are in this folder.
- `GET /api/blueprints/folder-files?dir=` lists the files in the folder the form names:
  - `~` is expanded as in the create route;
  - the list comes from the bounded walk and order of the changed-files list, capped higher;
  - a folder not made yet, or a path that is not a folder, lists none;
  - a relative path or a root is refused.

  It exposes nothing the Files view does not: that view already takes a browser-chosen base.
- The form's 「フォルダから選ぶ」 lists them, marks the ones already in the answer, and adds or removes a line on a click (`toggleLine`, pure).
  - It asks for a folder first.
  - It says when there are no files, or more than it lists.
  - It hides a list read for another folder.
- The picker sits after the field's `v-if` chain: placed inside it, it took the `v-else` and put a stray text input under every select. That was caught on screen in this change, and a test now pins one field per kind.

## Verification

- `answerLines`/`toggleLine`: line endings, blanks, add, remove, whole-line match.
- Hearing: `pick` without `lines`, or an unknown pick, is refused.
- Packs: in-folder file questions pick files.
- The route over HTTP: order, hidden files, `~`, a folder not made yet, a file, a relative path, a root.
- The picker: needs a folder; lists and marks; adds and removes; none and more; hides on a folder change; shows a refusal.
- The field: the picker only on file questions; one field per kind.
- Each decision inverted in turn goes red. Survivors were redundant code, which was removed: a line split `trim` already covered, a stale-load guard the display condition already covered, and a presence check the walk already covered.
- In a browser on the test server: the button is disabled until a folder is entered; for `~/ss/llm/bp-ex-itaku-keiyaku-010` it listed `contract.proposed.txt` and `contract.txt`, and a click put `contract.txt` into the answer. Every question shows one field.
