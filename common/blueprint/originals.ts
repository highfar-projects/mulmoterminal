// A build's originals — the copies it kept in .blueprint/originals/ before changing a document — beside the files as
// they are now, for the finished screen to show what changed. Shared: the server sends this shape, the view parses it.
import { z } from "zod";

/** Where a build keeps the original of each document it changes, under the same relative path. */
export const ORIGINALS_DIR = ".blueprint/originals";

/** How many files the finished screen compares; more are there to open, but a page of diffs has to end. */
export const ORIGINALS_MAX = 20;

export const originalsViewSchema = z.object({
  files: z.array(z.object({ path: z.string(), original: z.string(), current: z.string().nullable() })),
  more: z.boolean(),
});
export type OriginalsView = z.infer<typeof originalsViewSchema>;

/** The paths to compare, in a stable order and at most `max`; `more` when some were left out. */
export const originalPaths = (paths: readonly string[], max: number = ORIGINALS_MAX): { paths: string[]; more: boolean } => {
  const sorted = [...new Set(paths)].sort((a, b) => Number(a > b) - Number(a < b));
  return { paths: sorted.slice(0, max), more: sorted.length > max };
};
