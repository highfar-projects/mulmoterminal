// GET /api/collections/actions — each collection's collection-level actions and nothing else, for
// the command palette (#2471). New to this repo: MulmoClaude has no equivalent route, and `/detail`
// carries every record, too much to fetch per collection each time the palette opens.
import type { Express } from "express";
import { discoverCollections } from "@mulmoclaude/core/collection/server";
import { resolveProjectRoot } from "../../infra/project-root.js";
import { collectionActionIndex } from "./collectionActionIndex.js";
import { guarded } from "./collections.js";

export function mountCollectionActionIndex(app: Express): void {
  app.get(
    "/api/collections/actions",
    guarded("actions index", async (req, res) => {
      res.json({ collections: collectionActionIndex(await discoverCollections(resolveProjectRoot(req))) });
    }),
  );
}
