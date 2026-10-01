# feat: Skills viewer (#2815, first slice)

## What

A read-only Skills screen opened from the toolbar's feature menu ("More features").

- **User global** — `~/.claude/skills/`.
- **Plugins** — each plugin enabled in the user settings and installed for the user
  (`~/.claude/plugins/installed_plugins.json`), its skills under `<installPath>/skills/`, shown by the
  name claude runs them with (`plugin:skill`). Reuses `enabledPluginIds` / `enabledInstalls` from
  `remoteHost/pluginSkills.ts`; project-scoped plugin installs are not shown.
- **Projects** — every directory a grid terminal has run in (the cwd history the server already keeps in
  `~/.mulmoterminal/dev-terminal-cwds.json`, read through `registry.ts`), each scanned for
  `<dir>/.claude/skills/`. A directory with no skills is not listed. Newest session first.
- A project skill whose slug also exists in the user dir is marked as overriding it (the shadow
  information the issue calls the main value).
- A simple search box: case-insensitive, every whitespace-separated term must appear in the slug, the
  description or the directory.
- Three columns: places, the skills of the chosen place, the chosen SKILL.md rendered (frontmatter
  stripped). One plugin can bring a thousand skills, so a single grouped list does not work. The
  search narrows the first two columns together; when the chosen place has no match, the first place
  that does is shown.

## Decisions

- Discovery reuses `collectSkills` from `server/backends/remoteHost/skills.ts`, so "what counts as a
  skill" (SKILL.md with a `description` in frontmatter, safe slug) is the same rule the header's Skill
  menu uses. `skillOverrides` is not applied: the viewer shows what is on disk.
- User skills are listed first even though a project skill wins over them: they apply in every
  folder, and with many folders listed they would otherwise sit at the bottom.
- A directory whose `.claude/skills` IS the user dir (a terminal opened in `$HOME`) is dropped, so the
  same skills are not listed twice.
- The SKILL.md read takes `dir` + `slug` rather than a path. The server only answers for a directory in
  the remembered cwd set, an enabled user plugin by name, or the user dir, and a slug passing `SLUG_RE`, so the route cannot be used to
  read arbitrary files. The read is capped in size.
- Pure rules (source ordering/dedupe, override marking, search) live in `common/skillCatalog.ts` and are
  unit-tested; the server route and the overlay are thin.

## Not in this slice

Builtin skills, project-scoped plugins, categories, usage frequency, editing, copying to another project,
command-palette entry. The issue stays open for them.
