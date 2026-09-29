// A collection a build starts from: which collections come with it, and which of each one's files are copied into
// the build's `.blueprint/source/`. Only the decisions live here; reading and writing are the server's.
import { uniqueBacklinkSources, uniqueEmbedTargets, uniqueRefTargets, type CollectionItem, type CollectionSchema } from "@mulmoclaude/core/collection";

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

/** Every folder the files sit under, relative to the build's folder, outermost first: `.blueprint`, `.blueprint/source`, … */
export function foldersAbove(files: readonly string[]): string[] {
  const folders = files.flatMap((file) => {
    const parts = file.split("/").slice(0, -1);
    return parts.map((_part, index) => parts.slice(0, index + 1).join("/"));
  });
  return [...new Set(folders)].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}

/** Where a collection's file goes in the build's folder. */
export const sourcePath = (slug: string, file: string): string => `${SOURCE_DIR}/collections/${slug}/${file}`;

export type SourceRecord = { from: "collection" | "app"; start: string; collections: string[]; missing: string[]; records: boolean; takenAt: string };

/**
 * `source.json`: what was taken — one collection with the ones it links to, or a shared app whole — from where, when,
 * and whether the records came too. The spec step reads it first.
 */
export const sourceRecord = (
  from: SourceRecord["from"],
  start: string,
  closure: { slugs: string[]; missing: string[] },
  records: boolean,
  takenAtMs: number,
): SourceRecord => ({
  from,
  start,
  collections: closure.slugs,
  missing: closure.missing,
  records,
  takenAt: new Date(takenAtMs).toISOString(),
});

/** Where a shared app's declaration goes in the copy. */
export const APP_MANIFEST_COPY = `${SOURCE_DIR}/app.json`;

/** Where a collection's records go: one JSON object per line, in the order the store listed them. */
export const RECORDS_FILE = "records.jsonl";

export const recordsJsonl = (items: readonly CollectionItem[]): string => items.map((item) => `${JSON.stringify(item)}\n`).join("");

/** Where a file a record points at goes: under the source's `files/`, at the path the record names. */
export const SOURCE_FILES_DIR = `${SOURCE_DIR}/files`;

// A path a record may name for a file to copy: relative, forward slashes, no step up or out.
const isPlainRelative = (value: string): boolean =>
  value !== "" &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  !value.includes("\0") &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");

/** The workspace files the records point at through `image` and `file` fields, once each; any other value is ignored. */
export function referencedFiles(schema: CollectionSchema, items: readonly CollectionItem[]): string[] {
  const keys = Object.entries(schema.fields).flatMap(([key, spec]) => (spec.type === "image" || spec.type === "file" ? [key] : []));
  const values = items.flatMap((item) => keys.map((key) => item[key]));
  return [...new Set(values.filter((value): value is string => typeof value === "string" && isPlainRelative(value)))].sort((a, b) => a.localeCompare(b));
}

/** The most a copy may weigh. Past it the build is refused before anything is written: a copy that large belongs in a real migration. */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
