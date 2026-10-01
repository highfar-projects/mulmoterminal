# feat: open the Skills viewer from the command palette and a key (#2815)

The Skills viewer (#2816) opened only from the toolbar's feature menu. It becomes a screen like Rooms,
Blueprints and Worklog: a row in the command palette's screens, and an app action `screen-skills`
that a `keymap` binding or a `run: "action"` header button can name.

- `screen-skills` joins `KEYMAP_ACTIONS` and `SCREEN_ACTIONS` (screen `skills`), so the palette does
  not list it twice and `runAppAction` opens it on every screen.
- `skills` joins `PALETTE_SCREENS`, with the feature menu's icon and label, opened by `skillsViewOpen`.
  It is not gated: the viewer needs no setup.
- Shortcut label in all five locales; `config.md` (en/ja) and the `mulmoterminal-keys` skill list it.

Not here: the rest of #2815 (usage counts, resolution details, categories) — judged not worth building
until a real need shows up.
