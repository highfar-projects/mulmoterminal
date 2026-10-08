import type { SortMode } from "./gridTabs";

// What the toolbar's ordering control shows for each mode. Split out of the .vue so the list and
// the icons are directly testable — the menu is the only way to reach "priority", so a mode missing
// from it would strand the feature. The words live in the i18n dictionaries under `sortMenu`.
export interface SortModeButton {
  icon: string;
  // Highlighted whenever an automatic ordering is in effect, i.e. anything but the hand-arranged one.
  active: boolean;
}

/** Every mode, in the order the menu lists them. */
export const SORT_MODES: readonly SortMode[] = ["auto", "manual", "priority"];

export const isSortMode = (value: string): value is SortMode => SORT_MODES.some((mode) => mode === value);

const ICON: Record<SortMode, string> = {
  auto: "sort",
  manual: "reorder",
  priority: "format_list_numbered",
};

export const sortModeIcon = (mode: SortMode): string => ICON[mode];

export function sortModeButton(mode: SortMode): SortModeButton {
  return { icon: ICON[mode], active: mode !== "manual" };
}
