// A collection a build starts from: which collections come with it, and which of each one's files are copied into
// the build's `.blueprint/source/`. Only the decisions live here; reading and writing are the server's.
import { uniqueBacklinkSources, uniqueEmbedTargets, uniqueRefTargets, type CollectionSchema } from "@mulmoclaude/core/collection";

/** Where the copy of the source goes in the build's folder. */
export const SOURCE_DIR = ".blueprint/source";

// The only files a skill folder may contribute besides schema.json and SKILL.md: a declared view or template, one level
// down. Anything else a schema names — a path up and out, a folder, another extension — is not copied.
const SKILL_FILE_RE = /^(views\/[A-Za-z0-9][A-Za-z0-9._-]*\.html|templates\/[A-Za-z0-9][A-Za-z0-9._-]*\.md)$/;

/** Every collection this one reads records from: its refs, embeds, backlinks and rollups. */
export const linkedSlugs = (schema: CollectionSchema): string[] => [
  ...new Set([...uniqueRefTargets(schema), ...uniqueEmbedTargets(schema), ...uniqueBacklinkSources(schema)]),
];

/**
 * The start and every collection reachable from it through links, start first, each once; and the linked slugs that
 * could not be loaded, so the spec can say what is missing instead of silently building without it.
 */
export function collectionClosure(start: string, schemaOf: (slug: string) => CollectionSchema | null): { slugs: string[]; missing: string[] } {
  const slugs: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const visit = (slug: string): void => {
    if (seen.has(slug)) return;
    seen.add(slug);
    const schema = schemaOf(slug);
    if (schema === null) {
      missing.push(slug);
      return;
    }
    slugs.push(slug);
    linkedSlugs(schema).forEach(visit);
  };
  visit(start);
  return { slugs, missing };
}

const templatesOf = (entries: readonly object[] | undefined): string[] =>
  (entries ?? []).flatMap((entry) => ("template" in entry && typeof entry.template === "string" ? [entry.template] : []));

/** The skill-folder files a collection's schema declares — its views and its action and ingest templates — that may be copied. */
export function declaredSkillFiles(schema: CollectionSchema): string[] {
  const named = [
    ...(schema.views ?? []).map((view) => view.file),
    ...templatesOf(schema.actions),
    ...templatesOf(schema.collectionActions),
    ...templatesOf(schema.ingest === undefined ? [] : [schema.ingest]),
  ];
  return [...new Set(named.filter((file) => SKILL_FILE_RE.test(file)))].sort((a, b) => a.localeCompare(b));
}

/** Where a collection's file goes in the build's folder. */
export const sourcePath = (slug: string, file: string): string => `${SOURCE_DIR}/collections/${slug}/${file}`;

export type SourceRecord = { from: "collection"; start: string; collections: string[]; missing: string[]; takenAt: string };

/** `source.json`: what was taken, from where, and when — the spec step reads it first. */
export const sourceRecord = (start: string, closure: { slugs: string[]; missing: string[] }, takenAtMs: number): SourceRecord => ({
  from: "collection",
  start,
  collections: closure.slugs,
  missing: closure.missing,
  takenAt: new Date(takenAtMs).toISOString(),
});
