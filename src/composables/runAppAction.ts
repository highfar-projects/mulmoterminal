// Carrying out a toolbar operation asked for by name — a key on any screen, or a header button.
// Each calls what the toolbar and the command palette already call, so the three cannot disagree.
import { isOrderAction, isScreenAction, orderOfAction, screenOfAction, type AppAction } from "../../common/appActions";
import { paletteGridView } from "./commandPalette";
import { SCREEN_OPENERS } from "./paletteScreenOpeners";
import { visibleScreens, type PaletteScreen } from "./paletteScreens";
import { settingsOpen } from "./settingsOpener";
import { useGatedEntries } from "./useGatedEntries";
import { useSoundEnabled } from "./useSoundEnabled";

// A screen for a feature that is not set up opens onto nothing, which the toolbar hides and this
// refuses, so the caller can say so.
const screenReady = (screen: PaletteScreen): boolean => visibleScreens(useGatedEntries().value).includes(screen);

/** Do `action`. False when it cannot be done now — a screen not set up, or no grid for the
 *  view / order — so a button can say so rather than do nothing. */
export function runAppAction(action: AppAction): boolean {
  if (isScreenAction(action)) return openScreen(screenOfAction(action));
  if (action === "settings-open") settingsOpen.value = true;
  else if (action === "sound-toggle") useSoundEnabled().toggle();
  else return runGridView(action);
  return true;
}

function openScreen(screen: PaletteScreen): boolean {
  if (!screenReady(screen)) return false;
  SCREEN_OPENERS[screen]();
  return true;
}

function runGridView(action: "view-toggle" | "order-auto" | "order-manual" | "order-priority"): boolean {
  const grid = paletteGridView.value;
  if (grid === null) return false;
  if (isOrderAction(action)) grid.setSortMode(orderOfAction(action));
  else grid.toggleListMode();
  return true;
}
