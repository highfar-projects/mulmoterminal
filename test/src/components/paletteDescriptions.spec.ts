import { describe, it, expect } from "vitest";
import { i18n } from "../../../src/i18n";
import { PALETTE_ACTIONS } from "../../../src/composables/commandPaletteRows";
import { paletteDescriptionKey } from "../../../src/components/keymapLabels";

// Every action the palette lists carries a description, in every locale. The descriptions are an
// untyped object, so a new action without one showed its raw key (`commandPalette.descriptions.…`)
// in the palette with nothing failing — which is how `files-insert-selection` shipped.
const LOCALES = ["en", "ja", "ko", "zh-CN", "zh-TW"] as const;

describe("command palette descriptions", () => {
  it.each(LOCALES.flatMap((locale) => PALETTE_ACTIONS.map((action) => [locale, action] as const)))("%s has one for %s", (locale, action) => {
    expect(i18n.global.te(paletteDescriptionKey(action), locale)).toBe(true);
  });
});
