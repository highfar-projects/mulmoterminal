import { menuFocusMove } from "./filesRowActions";

/** The keys that move the selection. The ARROWS only: `menuFocusMove` also answers Home and End, and
 *  in a row menu that is right — here the keyboard is in a text field, where both belong to the caret
 *  the user is editing with. */
const LIST_KEYS = ["ArrowUp", "ArrowDown"];

export type PickerPanelKeyAction = { kind: "close" } | { kind: "pick"; index: number } | { kind: "move"; to: number };

/** The two fields of a `KeyboardEvent` the decision reads. */
export interface PickerPanelKey {
  key: string;
  isComposing: boolean;
}

/** What a key pressed in a picker panel's text field does, or null when the panel leaves it alone. */
export function pickerPanelKeyAction(event: PickerPanelKey, active: number, rowCount: number): PickerPanelKeyAction | null {
  if (event.isComposing) return null; // an IME candidate list owns the arrows and Enter while composing
  if (event.key === "Escape") return { kind: "close" };
  if (event.key === "Enter") return { kind: "pick", index: active };
  if (!LIST_KEYS.includes(event.key)) return null;
  const to = menuFocusMove(event.key, active, rowCount);
  return to === null ? null : { kind: "move", to };
}
