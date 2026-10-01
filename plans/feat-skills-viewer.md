# feat: Skills viewer (#2815, first slice)

## What

A read-only Skills screen opened from the toolbar's feature menu ("More features").

- **User global** — `~/.claude/skills/`.
- **Projects** — every directory a grid terminal has run in (the cwd history the server already keeps in
  `~/.mulmoterminal/dev-terminal-cwds.json`, read through `registry.ts`), each scanned for
  `<dir>/.claude/skills/`. A directory with no skills is not listed. Newest session first.
- A project skill whose slug also exists in the user dir is marked as overriding it (the shadow
  information the issue calls the main value).
- A simple search box: case-insensitive, every whitespace-separated term must appear in the slug, the
  description or the directory.
- Clicking a skill shows its SKILL.md rendered (frontmatter stripped) in the right half.

## Decisions

- Discovery reuses `collectSkills` from `server/backends/remoteHost/skills.ts`, so "what counts as a
  skill" (SKILL.md with a `description` in frontmatter, safe slug) is the same rule the header's Skill
  menu uses. `skillOverrides` is not applied: the viewer shows what is on disk.
- User skills are listed first even though a project skill wins over them: they apply in every
  folder, and with many folders listed they would otherwise sit at the bottom.
- A directory whose `.claude/skills` IS the user dir (a terminal opened in `$HOME`) is dropped, so the
  same skills are not listed twice.
- The SKILL.md read takes `dir` + `slug` rather than a path. The server only answers for a directory in
  the remembered cwd set (or the user dir) and a slug passing `SLUG_RE`, so the route cannot be used to
  read arbitrary files. The read is capped in size.
- Pure rules (source ordering/dedupe, override marking, search) live in `common/skillCatalog.ts` and are
  unit-tested; the server route and the overlay are thin.

## Not in this slice

Plugin and builtin skills, categories, usage frequency, editing, copying to another project,
command-palette entry. The issue stays open for them.
