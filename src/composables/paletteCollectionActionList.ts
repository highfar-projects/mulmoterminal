// Collection actions as command-palette rows name them (#2471): "Invoices: Summarise". Pure.
import type { CollectionActionGroup } from "../../common/collectionActions";

export interface PaletteCollectionAction {
  slug: string;
  id: string;
  label: string;
  icon: string;
}

export const paletteCollectionActionList = (groups: readonly CollectionActionGroup[]): PaletteCollectionAction[] =>
  groups.flatMap((group) =>
    group.actions.map((action) => ({ slug: group.slug, id: action.id, label: `${group.title}: ${action.label}`, icon: action.icon ?? group.icon })),
  );
