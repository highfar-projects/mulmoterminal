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

## The check reads the build, not the sources

`design.sh` runs `yarn build`, then `design.mjs` reads the stylesheets that build wrote (under folders named `dist`,
newer than the build's start) and holds them to `designRules.mjs`:

- Tailwind ran: `.bg-indigo-600` exists as Tailwind writes it, and the build defines `--color-indigo-600`.
- The design took: every colour and corner token the build kept has the template's value, or Tailwind's own
  (`node_modules/tailwindcss/theme.css`) for MulmoTerminal's look, compared after minification.
- Each screen is in the look: one class per screen that appears in no other section of the reference must have a
  rule (header, list, record panel; kanban and calendar when a copied collection has them). Tailwind writes a rule
  only for a class some screen uses.
- The icon font is in the build; the screens use `material-symbols-outlined` and every copied collection's icon;
  `DESIGN.md` names the design.

The first version scanned source text, and each review round found another way to satisfy it without the design
(a comment, a look-alike import name, a plugin imported but not used). The build is what the person gets, so the rule
moved there.

The collection's `color` is not used: inside a collection MulmoTerminal draws the header's icon box in indigo, and
the colour only marks the collection's shortcut. Following the screen is the point.
