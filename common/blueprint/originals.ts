// A build's originals — the copies it kept in .blueprint/originals/ before changing a document — beside the files as
// they are now, for the finished screen to show what changed. Shared: the server sends this shape, the view parses it.
import { z } from "zod";

/** Where a build keeps the original of each document it changes, under the same relative path. */
export const ORIGINALS_DIR = ".blueprint/originals";

/** How many files the finished screen compares; more are there to open, but a page of diffs has to end. */
export const ORIGINALS_MAX = 20;

export const originalsViewSchema = z.object({
  // `from` names the document a proposed copy is compared with; an original kept under ORIGINALS_DIR has none.
  files: z.array(z.object({ path: z.string(), original: z.string(), current: z.string().nullable(), from: z.string().optional() })),
  more: z.boolean(),
});
export type OriginalsView = z.infer<typeof originalsViewSchema>;

/** The paths to compare, in a stable order and at most `max`; `more` when some were left out. */
export const originalPaths = (paths: readonly string[], max: number = ORIGINALS_MAX): { paths: string[]; more: boolean } => {
  const sorted = [...new Set(paths)].sort((a, b) => Number(a > b) - Number(a < b));
  return { paths: sorted.slice(0, max), more: sorted.length > max };
};

const PROPOSED = ".proposed";

/**
 * The document a proposed copy was made from: `contract.proposed.txt` → `contract.txt`, `docs/a.proposed.md` →
 * `docs/a.md`, `notes.proposed` → `notes`. Null for a name that is not a proposed copy of anything.
 */
export const proposedBase = (file: string): string | null => {
  const slash = file.lastIndexOf("/");
  const [folder, name] = [file.slice(0, slash + 1), file.slice(slash + 1)];
  const at = name.lastIndexOf(PROPOSED);
  if (at <= 0) return null;
  const extension = name.slice(at + PROPOSED.length);
  const isExtension = extension === "" || (extension.startsWith(".") && extension.length > 1 && !extension.slice(1).includes("."));
  return isExtension ? `${folder}${name.slice(0, at)}${extension}` : null;
};
