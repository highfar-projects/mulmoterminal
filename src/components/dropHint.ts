// What a failed drop tells the user to do instead. Point at a file picker only when one is actually
// present — header buttons are configurable, and only a session cell has the path menu — otherwise
// fall back to advice that always holds.
export const DROP_HINT_PICKER_EN = "This browser doesn't share a dropped file's path. Use the paperclip button in the header (Insert a file path) instead.";
export const DROP_HINT_PATH_MENU_EN =
  "This browser doesn't share a dropped file's path. Click the folder path in the header and choose Insert a file path instead.";
export const DROP_HINT_TYPE_EN = "This browser doesn't share a dropped file's path — type or paste the path instead.";

export interface PickerPresence {
  /** The resolved header buttons include an `open.pickFile` one. */
  pickerButton: boolean;
  /** The terminal's header carries the path menu with "Insert a file path". */
  pathMenuPicker: boolean;
}

// The header button wins: it is one click where the menu is two, and the user chose to put it there.
export function dropHintEnglish({ pickerButton, pathMenuPicker }: PickerPresence): string {
  if (pickerButton) return DROP_HINT_PICKER_EN;
  return pathMenuPicker ? DROP_HINT_PATH_MENU_EN : DROP_HINT_TYPE_EN;
}
