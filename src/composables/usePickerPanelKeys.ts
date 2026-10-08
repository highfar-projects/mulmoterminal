import type { Ref } from "vue";
import { pickerPanelKeyAction } from "../components/pickerPanelKeys";

interface PickerPanelKeysOptions {
  panel: Readonly<Ref<HTMLElement | null>>;
  active: Ref<number>;
  rowCount: () => number;
  pick: (index: number) => void;
  close: () => void;
}

interface PickerPanelKeys {
  onKeydown: (event: KeyboardEvent) => void;
  onOutside: (event: PointerEvent) => void;
}

/** The keyboard and outside-click handling shared by the panels that pick one row from a typed query. */
export function usePickerPanelKeys(options: PickerPanelKeysOptions): PickerPanelKeys {
  function onKeydown(event: KeyboardEvent): void {
    const action = pickerPanelKeyAction(event, options.active.value, options.rowCount());
    if (!action) return;
    event.preventDefault();
    if (action.kind === "close") options.close();
    else if (action.kind === "pick") options.pick(action.index);
    else options.active.value = action.to;
  }

  // Clicking anywhere else is "not this after all". Pointerdown rather than click, so the pane
  // underneath does not also act on the same gesture.
  function onOutside(event: PointerEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (!options.panel.value?.contains(target)) options.close();
  }

  return { onKeydown, onOutside };
}
