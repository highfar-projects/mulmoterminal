import { describe, it, expect } from "vitest";
import { i18n } from "../../../src/i18n";
import { LAUNCH_COMMAND } from "../../../common/launchCommand";

// The fork's messages are laid over upstream's bundles in src/i18n/fork.ts rather than written into
// them. Nothing would fail to compile if that layer stopped being applied, so this pins it at runtime.
const LOCALES = ["en", "ja", "ko", "zh-CN", "zh-TW"] as const;

describe("fork messages over upstream's bundles", () => {
  it.each(LOCALES)("%s: the restart hint names this fork's command", (locale) => {
    expect(i18n.global.t("settings.quit.restartHint", {}, { locale })).toContain(LAUNCH_COMMAND);
  });

  it.each(LOCALES)("%s: the forkTips section is there", (locale) => {
    expect(i18n.global.te("forkTips.reconnect", locale)).toBe(true);
    expect(i18n.global.te("forkTips.devcontainer.rebuild", locale)).toBe(true);
  });

  it("upstream's own sections are still there", () => {
    expect(i18n.global.te("settings.quit.restartHint", "en")).toBe(true);
    expect(i18n.global.te("tips.toolbar.settings", "en")).toBe(true);
  });
});
