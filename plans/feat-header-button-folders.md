# feat: header button folders in Settings (#2622, last step)

After add / edit / remove / move (#2680, #2702, #2709), folders:

- **Put in a folder** (a folder icon on a top-level button): into an existing folder (at its end), or a
  new folder named there, made where the button was. A folder needs at least one button — the loader
  drops an empty one — so this is how a folder comes to exist.
- **Take out** (on a button inside a folder): it lands right after the folder; taking out the last one
  puts it in the folder's place and the folder goes.
- A folder's buttons are listed under it, each editable and removable (removing the last removes the
  folder too). The folder's own name, icon and `when` are edited from its pencil.

Rules: `common/headerButtonFolders.ts`, on structural shapes both sides can call (the loader's optional
fields may be present and undefined). Routes: `into-folder`, `out-of-folder`, `folder-edit`; `remove`
and `edit` now reach a button inside a folder. Folder ids are derived from the name and free across the
whole list, children included.

Not in this step: reordering inside a folder, and moving a button between folders directly (take it
out, put it in).

## Verification

- Specs: every folder operation both ways (new / existing / missing / full / bad name or icon; out as
  last and not last; remove and edit inside a folder; folder fields kept and refused), the routes on a
  temp HOME, the editor's picker, nested rows and folder form. The empty-folder rule goes red when
  broken.
- Real server + browser (demo HOME, a Claude cell): two buttons put into a new folder `Dev`, the cell
  showed the folder with both in its menu, and taking both out left `["pr","test","build"]`.
