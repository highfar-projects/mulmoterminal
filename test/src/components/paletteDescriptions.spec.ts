import { describe, it, expect } from "vitest";
import { i18n } from "../../../src/i18n";
import { KEYMAP_ACTIONS, TERMINAL_SCOPED_ACTIONS } from "../../../common/keymap";
import { keymapLabelKey } from "../../../src/components/keymapLabels";

// Every action the palette lists carries a description, in every locale. The descriptions are an
// untyped object, so a new action without one showed its raw key (`commandPalette.descriptions.…`)
// in the palette with nothing failing — which is how `files-insert-selection` shipped.
const LOCALES = ["en", "ja", "ko", "zh-CN", "zh-TW"] as const;
const listed = KEYMAP_ACTIONS.filter((action) => !TERMINAL_SCOPED_ACTIONS.includes(action) && action !== "command-palette");

describe("command palette descriptions", () => {
  it.each(LOCALES.flatMap((locale) => listed.map((action) => [locale, action] as const)))("%s has one for %s", (locale, action) => {
    const key = `commandPalette.descriptions.${keymapLabelKey(action).split(".").pop() ?? ""}`;
    expect(i18n.global.te(key, locale)).toBe(true);
  });
});
