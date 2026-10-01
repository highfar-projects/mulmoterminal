// Which item of an anchored menu takes focus when it opens.
//  - first: the top item.
//  - checked: the item marked checked, and none when nothing is — a radio menu always has one.
//  - checkedOrFirst: the checked item, else the top one, so Enter on open undoes what is showing.
export const ANCHORED_MENU_INITIAL_FOCUS = ["first", "checked", "checkedOrFirst"] as const;
export type AnchoredMenuInitialFocus = (typeof ANCHORED_MENU_INITIAL_FOCUS)[number];

export interface MenuItemLike {
  getAttribute(name: string): string | null;
}

const isChecked = (item: MenuItemLike): boolean => item.getAttribute("aria-checked") === "true";

export function initialMenuItem<Item extends MenuItemLike>(focus: AnchoredMenuInitialFocus, items: Item[]): Item | undefined {
  if (focus === "first") return items[0];
  const checked = items.find(isChecked);
  return focus === "checked" ? checked : (checked ?? items[0]);
}
