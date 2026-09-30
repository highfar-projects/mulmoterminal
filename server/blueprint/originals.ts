// The originals a build kept, each beside the file as it is now. Read with the same guard as every file a build reads
// back (no link followed, nothing outside the project, a size limit), so a path under .blueprint/originals/ cannot
// reach anything a report could not.
import path from "node:path";
import type { FolderListing } from "../../common/blueprint/changedFiles.js";
import { ORIGINALS_DIR, originalPaths, type OriginalsView } from "../../common/blueprint/originals.js";

export interface OriginalsReader {
  list: (dir: string) => Promise<FolderListing>;
  read: (dir: string, relativePath: string) => Promise<string | null>;
}

/** Each original under `projectDir` that could be read, with the current file (null when it is gone). */
export async function originalsOf(projectDir: string, reader: OriginalsReader): Promise<OriginalsView> {
  const listing = await reader.list(path.join(projectDir, ORIGINALS_DIR));
  const { paths, more } = originalPaths(listing.entries.map((entry) => entry.path));
  const pairs = await Promise.all(
    paths.map(async (relative) => {
      const [original, current] = await Promise.all([reader.read(projectDir, `${ORIGINALS_DIR}/${relative}`), reader.read(projectDir, relative)]);
      return original === null ? [] : [{ path: relative, original, current }];
    }),
  );
  return { files: pairs.flat(), more: more || !listing.complete };
}
