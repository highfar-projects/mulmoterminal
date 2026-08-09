// getCollection command handler.
//
// One collection's detail + a PAGE of its records (pagination mandatory — the result
// rides inside a 1 MiB Firestore command doc).
//
// Records come from the STORE seam, never a raw `listItems(dataDir)`: a collection
// backed by a `dataSource` CSV or SQLite keeps no `.json` records on disk, so the
// dataDir read returned an empty page to the phone while the desktop UI (which has
// always gone through `storeFor`) showed the rows (#1488).
//
// Factory (createGetCollection) keeps the mapping unit-testable with the engine
// stubbed; the default export wires the real engine functions. Mirrors
// MulmoClaude's server/remoteHost/handlers/getCollection.ts.
import { loadCollection, storeFor, toDetail, type LoadedCollection } from "@mulmoclaude/core/collection/server";
import { workspaceScope } from "../../../infra/project-root.js";
import type { CollectionItem } from "@mulmoclaude/core/collection";
import type { CommandHandlers, JsonObject } from "@mulmoclaude/core/remote-host";
import { clampLimit, clampOffset, deriveItems, pageResult } from "../collectionPage.js";
import { readString } from "../../../../common/readString.js";

export interface GetCollectionDeps {
  loadCollection: typeof loadCollection;
  /** Store-aware records loader (file records or a dataSource CSV's rows). */
  listRecords: (collection: LoadedCollection) => Promise<CollectionItem[]>;
  toDetail: typeof toDetail;
}

export const createGetCollection =
  (deps: GetCollectionDeps): CommandHandlers["getCollection"] =>
  async (params: JsonObject) => {
    const slug = readString(params.slug);
    const offset = clampOffset(params.offset);
    const limit = clampLimit(params.limit);
    const collection = await deps.loadCollection(slug);
    if (!collection) throw new Error(`collection '${slug}' not found`);
    const all = deriveItems(collection.schema, await deps.listRecords(collection));
    return pageResult(deps.toDetail(collection), all, offset, limit);
  };

export const getCollection = createGetCollection({
  loadCollection: (slug) => loadCollection(slug, workspaceScope()),
  listRecords: (collection) => storeFor(collection, workspaceScope()).list(),
  toDetail,
});
