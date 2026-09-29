// The wire shape of GET /api/collections/actions (#2471): each collection's collection-level
// actions, for the command palette. Shared so the route and the client decide from one type.
import { isRecord } from "./isRecord.js";

export interface CollectionActionEntry {
  id: string;
  label: string;
  icon?: string;
}

export interface CollectionActionGroup {
  slug: string;
  title: string;
  icon: string;
  actions: CollectionActionEntry[];
}

const toEntry = (value: unknown): CollectionActionEntry[] => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") return [];
  return [typeof value.icon === "string" ? { id: value.id, label: value.label, icon: value.icon } : { id: value.id, label: value.label }];
};

/** The groups a response body holds; anything malformed is dropped rather than drawn blank. */
export function toCollectionActionGroups(body: unknown): CollectionActionGroup[] {
  if (!isRecord(body) || !Array.isArray(body.collections)) return [];
  return body.collections.flatMap((group): CollectionActionGroup[] => {
    if (!isRecord(group) || typeof group.slug !== "string" || typeof group.title !== "string" || !Array.isArray(group.actions)) return [];
    const actions = group.actions.flatMap(toEntry);
    return actions.length === 0 ? [] : [{ slug: group.slug, title: group.title, icon: typeof group.icon === "string" ? group.icon : "database", actions }];
  });
}
