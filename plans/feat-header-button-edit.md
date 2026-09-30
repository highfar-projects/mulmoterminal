# feat: edit an existing header button in Settings (#2622, step 3)

After #2680 (add / remove / move) and #2702 (open and action buttons), a row in Settings → Header
buttons and chips has a pencil: the form fills with that button, and **Save changes** replaces its
fields in place (`POST /api/config/buttons/edit`, under the config lock against the file).

## Decisions

- **The id stays.** A shell button is re-resolved by id when it runs, and a project's
  `.mulmoterminal.json` overrides a global button by id, so an edit must not rename it. `order` and
  `emoji`, which the form does not show, are kept too.
- **What the form cannot show is not offered for editing**: a folder, and an `open` naming more than
  one target (possible only by hand). `draftOfEntry` (common) decides both, and the server refuses a
  folder (`folder`).
- After an add, the kind and the open target stay chosen for the next button; after an edit, the form
  empties.

Still left in #2622: folders.

## Verification

- Specs: `draftOfEntry` for every kind and the refusals, `entriesWithEdited` both ways, the edit route
  (id and order kept, folder refused, malformed body), the editor's edit / save / cancel.
- Real server + browser (demo HOME, a Claude cell): a button added, then edited from its pencil — the
  file kept id `build-it` with the new label and command, and the cell showed the new name without a
  reload.
