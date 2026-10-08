// The Skills viewer's catalog (#2815): which skill directories exist, what each holds, and the
// search over them. Shared because the server assembles it and the overlay filters it, and both
// must agree on its shape.

export type SkillScope = "user" | "plugin" | "project";

export interface FoundSkill {
  slug: string;
  description: string;
}

export interface CatalogSkill extends FoundSkill {
  /** The name claude runs it by: `plugin:slug` for a plugin's skill, else the slug. */
  id: string;
  /** A project skill whose slug also exists in the user dir: claude runs this one, not that. */
  overridesUser: boolean;
}

export interface SkillSource {
  scope: SkillScope;
  /** The directory whose `.claude/skills` this is; the skills dir itself for the user scope, the
   *  install directory for a plugin. */
  dir: string;
  /** The plugin's name for the plugin scope, else "". */
  plugin: string;
  skills: CatalogSkill[];
}

export interface SkillCatalog {
  sources: SkillSource[];
}

export interface FoundSource {
  dir: string;
  skills: FoundSkill[];
}

export interface FoundPlugin extends FoundSource {
  plugin: string;
}

/** Every directory once, the most recently recorded first. The cwd log only grows, so a
 *  directory's LAST entry is the one that says when it was used. */
export function recentDistinctDirs(dirsOldestFirst: readonly string[]): string[] {
  return [...new Set([...dirsOldestFirst].reverse())];
}

const bySlug = (left: FoundSkill, right: FoundSkill): number => left.slug.localeCompare(right.slug);

function catalogSource(scope: SkillScope, found: FoundSource, plugin: string, userSlugs: ReadonlySet<string>): SkillSource {
  const skills = [...found.skills].sort(bySlug).map((skill) => ({
    ...skill,
    id: plugin ? `${plugin}:${skill.slug}` : skill.slug,
    overridesUser: scope === "project" && userSlugs.has(skill.slug),
  }));
  return { scope, dir: found.dir, plugin, skills };
}

/** User skills first — they apply in every directory — then the plugins, then the projects in the
 *  order given. A source with no skills is left out. A plugin's skills are namespaced, so they never
 *  override anything. */
export function assembleSkillCatalog(user: FoundSource, plugins: readonly FoundPlugin[], projects: readonly FoundSource[]): SkillCatalog {
  const userSlugs = new Set(user.skills.map((skill) => skill.slug));
  const sources = [
    catalogSource("user", user, "", userSlugs),
    ...plugins.map((found) => catalogSource("plugin", found, found.plugin, userSlugs)),
    ...projects.map((project) => catalogSource("project", project, "", userSlugs)),
  ];
  return { sources: sources.filter((source) => source.skills.length > 0) };
}

const searchTerms = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(Boolean);

const skillMatches = (skill: CatalogSkill, dir: string, terms: readonly string[]): boolean => {
  const haystack = `${skill.id}\n${skill.description}\n${dir}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

/** The catalog narrowed to skills matching EVERY term of `query` in slug, description or directory.
 *  A blank query returns the catalog unchanged; a source left with nothing is dropped. */
export function filterSkillCatalog(catalog: SkillCatalog, query: string): SkillCatalog {
  const terms = searchTerms(query);
  if (terms.length === 0) return catalog;
  const sources = catalog.sources.map((source) => ({ ...source, skills: source.skills.filter((skill) => skillMatches(skill, source.dir, terms)) }));
  return { sources: sources.filter((source) => source.skills.length > 0) };
}
