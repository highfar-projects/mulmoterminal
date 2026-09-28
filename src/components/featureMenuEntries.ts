// What the toolbar's feature menu lists, in order. An entry for a feature that is not set up opens
// onto an empty screen, so it is left out. Blueprints needs no setup, so the menu is never empty.
import type { GatedEntry } from "./gatedToolbarEntries";

export type FeatureMenuEntry = "rooms" | "blueprints" | "worklog";

export const FEATURE_MENU_ICONS: Record<FeatureMenuEntry, string> = {
  rooms: "forum",
  blueprints: "architecture",
  worklog: "history_edu",
};

export function featureMenuEntries(gated: Record<GatedEntry, boolean>): FeatureMenuEntry[] {
  const entries: FeatureMenuEntry[] = [];
  if (gated.rooms) entries.push("rooms");
  entries.push("blueprints");
  if (gated.worklog) entries.push("worklog");
  return entries;
}
