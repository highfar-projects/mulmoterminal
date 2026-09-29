# feat: header colour per status in Settings (#2618)

Part of #2616.

## What

Settings → Header buttons and chips gets a row per status (working / done / blocked) for the global
`headerStatusColors`:

- a sample header painted by the grid cell's own class (`HEADER_STATUS`) and style
  (`headerStatusStyleFor`), so the row shows what a terminal will show — the theme's wash while
  nothing is set;
- a background colour (a picker once set, "Theme's" until then);
- a text colour (a picker once set, "Auto (readable)" until then, and "Auto" to hand it back);
- "Back to the theme", which removes the status.

Every edit saves the whole set through `POST /api/config`; the control is locked while saving and
shows what the host holds when a save is refused.

## Decisions

- **A status with neither colour is removed**, not stored as two nulls: an absent status is how the
  file says "the theme decides" (`withStatusBackground` / `withStatusText` / `withoutStatus`, pure).
- **A picker starts on what the theme paints now**, read from the sample's computed style
  (`cssColorToHex`). A wash built with `color-mix()` computes to `color(srgb …)`, which is not read;
  each status then has its own start in the family of the colour it replaces.
- **Only the global default is edited here.** A directory's `.mulmoterminal.json` replaces the whole
  set for that directory (#2624 covers editing those through the Files pane).

## Verification

- Specs: `headerStatusColorEdit.spec.ts` (every edit round-trips through the server sanitizer
  unchanged), `headerStatusColorsEditor.spec.ts` (samples, start, pick, auto, reset, refused save,
  lock). Each extracted decision was inverted and the specs went red.
- A real server with a scratch HOME: the samples show the theme's wash, each edit wrote
  `config.json`, and the value survived a reload.
