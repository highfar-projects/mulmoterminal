// The originals a build kept, each beside the file as it is now. Read with the same guard as every file a build reads
// back (no link followed, nothing outside the project, a size limit), so a path under .blueprint/originals/ cannot
// reach anything a report could not.
import path from "node:path";
import type { FolderListing } from "../../common/blueprint/changedFiles.js";
import { ORIGINALS_DIR, ORIGINALS_MAX, originalPaths, proposedBase, type OriginalsView } from "../../common/blueprint/originals.js";

export interface OriginalsReader {
  list: (dir: string) => Promise<FolderListing>;
  read: (dir: string, relativePath: string) => Promise<string | null>;
}

type Pair = OriginalsView["files"][number];

// Each original the build kept under ORIGINALS_DIR, with the file now (null when it is gone).
async function keptOriginals(projectDir: string, reader: OriginalsReader): Promise<{ pairs: Pair[]; more: boolean }> {
  const listing = await reader.list(path.join(projectDir, ORIGINALS_DIR));
  const { paths, more } = originalPaths(listing.entries.map((entry) => entry.path));
  const pairs = await Promise.all(
    paths.map(async (relative) => {
      const [original, current] = await Promise.all([reader.read(projectDir, `${ORIGINALS_DIR}/${relative}`), reader.read(projectDir, relative)]);
      return original === null ? [] : [{ path: relative, original, current }];
    }),
  );
  return { pairs: pairs.flat(), more: more || !listing.complete };
}

// Each proposed copy written since the build started (a review's `contract.proposed.txt`), with the document it was
// made from. One whose document is gone, or that is itself unreadable, is left out: there is nothing to compare.
async function proposedCopies(projectDir: string, reader: OriginalsReader, sinceMs: number): Promise<{ pairs: Pair[]; more: boolean }> {
  const listing = await reader.list(projectDir);
  const written = listing.entries.filter((entry) => entry.mtimeMs >= sinceMs && proposedBase(entry.path) !== null).map((entry) => entry.path);
  const { paths, more } = originalPaths(written);
  const pairs = await Promise.all(
    paths.map(async (proposed) => {
      const from = proposedBase(proposed) ?? "";
      const [original, current] = await Promise.all([reader.read(projectDir, from), reader.read(projectDir, proposed)]);
      return original === null || current === null ? [] : [{ path: proposed, original, current, from }];
    }),
  );
  return { pairs: pairs.flat(), more: more || !listing.complete };
}

/**
 * What the build changed, each file beside what it came from: the originals it kept, then the proposed copies it
 * wrote since `sinceMs`. At most ORIGINALS_MAX in all; `more` when some were left out.
 */
export async function originalsOf(projectDir: string, reader: OriginalsReader, sinceMs: number): Promise<OriginalsView> {
  const [kept, proposed] = await Promise.all([keptOriginals(projectDir, reader), proposedCopies(projectDir, reader, sinceMs)]);
  const all = [...kept.pairs, ...proposed.pairs];
  return { files: all.slice(0, ORIGINALS_MAX), more: kept.more || proposed.more || all.length > ORIGINALS_MAX };
}
