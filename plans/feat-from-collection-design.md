# An app made from a collection keeps MulmoTerminal's look, or takes a design template (#2817)

A person who used a collection in MulmoTerminal expects the app made from it to look the same. Nothing in the pack
decided the look: the base `ui` skills say "plain and readable", so every build invented its own CSS.

- A hearing question `design` (見た目): `MulmoTerminal と同じ` by default, or one of three templates.
- `design/mulmoterminal.md` is the reference: the class strings of `@mulmoclaude/collection-plugin`'s screens
  (header, toolbar, table, enum colours, kanban, calendar, record panel), copied from its source with the commit
  named. The generated app gets Tailwind v4 (`@tailwindcss/vite`) and Material Symbols and uses those classes as
  written. MulmoTerminal shows the plugin's `material-icons` glyphs with Material Symbols Outlined, so the app does
  the same.
- A template is `design/themes/<theme>.css`: an `@theme` block that redefines `indigo`, `slate`, `gray`, `white` and
  the radii. The screens are written with MulmoTerminal's classes in every design; a template only changes what those
  classes mean. So there is one reference to follow, not four.
- A step `design` (見た目を合わせる) restyles what the earlier steps built: after `auth` on local, Cloudflare and
  Supabase, after `features` on Firebase. It writes `DESIGN.md`, which the later actions steps are told to follow.
- The check (`checks/design.mjs`, rules in `designRules.mjs`) reads the files: the packages, the Vite plugin, a
  stylesheet importing Tailwind, the template copied unchanged and imported (or no redefined colour for
  MulmoTerminal's look), the main button and icon classes, the starting collection's icon, and `DESIGN.md` naming
  the design. Then `yarn build`.

The collection's `color` is not used: inside a collection MulmoTerminal draws the header's icon box in indigo, and
the colour only marks the collection's shortcut. Following the screen is the point.
