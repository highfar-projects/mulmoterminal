# feat: edit the global header chips in Settings (#2622, first step)

Part of the Settings-in-the-GUI umbrella (#2616). The issue covers buttons and chips; by the
user's choice this first PR is **chips only** — a flat list of built-in ids or `{ label, text, when? }`.
Buttons (folders, per-`run` shapes) follow in a separate PR.

## What changes

- `common/headerChips.ts`: the rules — `chipsWithAdded` / `chipsWithout` / `chipsMoved`, the cap
  (`MAX_HEADER_CHIPS`, which `MAX_CHIPS` now reads) and the cell's built-in set (`CELL_CHIP_IDS`,
  which `TerminalCell` now reads instead of its own two copies).
- `server/config/header-chip-routes.ts`: `POST /api/config/chips/{add,remove,move,reset}`, each run
  under the config lock against the file on disk (the `mutateConfigOnDisk` path the custom-agent
  routes use).
- `HeaderChipsEditor.vue` in Settings → Header buttons and chips.
- After a saved change, `headerChipsRevision` makes every cell fetch its header again.

## Decisions

- **One entry per request, not the whole list.** A whole-list save drops what another tab or a
  hand-edit added since the page loaded (the finding that moved custom agents to one-entry routes).
- **Remove / move name the chip they mean** (`index` + the chip). A list that changed since load is
  refused with `stale` and the list as it now is, instead of acting on a position that now holds a
  different chip.
- **Unconfigured is not empty.** With no `chips` key the cell shows its default set, so the first
  change starts from that set; "back to the default set" removes the key rather than writing the set.
- **Only the built-ins a cell draws are offered** (`git work diff ctx usage env`). `dir`, `status`
  and `tools` are accepted by the loader but not drawn by the cell's chip row.
- A built-in already on the list is refused as `duplicate`; a custom chip may repeat, as the loader
  allows.
- Per-project chips stay in `.mulmoterminal.json` (the Files pane, #2624/#2625).

## Verification

- Specs: the pure rules both ways, the routes against a temp HOME (on-disk merge, stale refusal,
  malformed body, reset), the composable, the editor, and the row keys.
- Real server + browser (demo HOME, a Claude cell in a project): add / remove / move / reset wrote
  the expected file, and the new custom chip appeared in the open cell without a reload. With the
  revision bump removed, it did not.
- A Shell cell does not show configured chips; that is existing behaviour (its header is `Terminal.vue`'s).
