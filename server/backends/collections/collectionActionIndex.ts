// Every collection's collection-level actions, and nothing else (#2471): what the command palette
// lists. `/detail` carries the actions too, but with every record, which is too much to fetch for
// each collection each time the palette opens. Pure, so what is listed is a spec.
import type { LoadedCollection } from "@mulmoclaude/core/collection/server";
import type { CollectionActionEntry, CollectionActionGroup } from "../../../common/collectionActions.js";

/** Collections that have at least one collection-level action, in discovery order. `mutate` is
 *  record-level only and the schema refuses it here; it is skipped all the same. */
export function collectionActionIndex(collections: readonly Pick<LoadedCollection, "slug" | "schema">[]): CollectionActionGroup[] {
  return collections.flatMap((collection) => {
    const actions = (collection.schema.collectionActions ?? [])
      .filter((action) => action.kind !== "mutate")
      .map((action): CollectionActionEntry =>
        action.icon ? { id: action.id, label: action.label, icon: action.icon } : { id: action.id, label: action.label },
      );
    return actions.length === 0 ? [] : [{ slug: collection.slug, title: collection.schema.title, icon: collection.schema.icon, actions }];
  });
}
