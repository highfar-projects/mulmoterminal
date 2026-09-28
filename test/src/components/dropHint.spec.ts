import { describe, it, expect } from "vitest";
import { dropHintEnglish, DROP_HINT_PICKER_EN, DROP_HINT_PATH_MENU_EN, DROP_HINT_TYPE_EN } from "../../../src/components/dropHint";

describe("dropHintEnglish", () => {
  it("points at the header button whenever one is configured, path menu or not", () => {
    expect(dropHintEnglish({ pickerButton: true, pathMenuPicker: true })).toBe(DROP_HINT_PICKER_EN);
    expect(dropHintEnglish({ pickerButton: true, pathMenuPicker: false })).toBe(DROP_HINT_PICKER_EN);
  });

  it("points at the path menu when that is the only picker", () => {
    expect(dropHintEnglish({ pickerButton: false, pathMenuPicker: true })).toBe(DROP_HINT_PATH_MENU_EN);
  });

  it("falls back to typing the path when there is no picker at all", () => {
    expect(dropHintEnglish({ pickerButton: false, pathMenuPicker: false })).toBe(DROP_HINT_TYPE_EN);
  });
});
