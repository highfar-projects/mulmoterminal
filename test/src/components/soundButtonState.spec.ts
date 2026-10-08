import { describe, it, expect } from "vitest";
import { soundButtonState } from "../../../src/components/soundButtonState";
import { i18n } from "../../../src/i18n";

// What the button says, through the real messages under the pinned English locale.
const said = (enabled: boolean, blocked: boolean): string => i18n.global.t(soundButtonState(enabled, blocked).labelKey);

describe("soundButtonState", () => {
  it("reads as on when sound is enabled and audio plays", () => {
    expect(soundButtonState(true, false)).toEqual({ icon: "volume_up", labelKey: "tips.toolbar.soundOn", active: true, tone: "accent" });
  });

  it("reads as off when the user turned it off", () => {
    expect(soundButtonState(false, false)).toEqual({ icon: "volume_off", labelKey: "tips.toolbar.soundOff", active: false, tone: "accent" });
  });

  it("says BLOCKED when the setting is on but the browser will not play", () => {
    const state = soundButtonState(true, true);
    expect(state.icon).toBe("volume_mute");
    expect(said(true, true)).toContain("blocked");
  });

  it("gives the blocked state its own icon, distinct from both on and off", () => {
    // The whole bug: blocked used to render as plain "on", so the toolbar claimed sound worked
    // while notifications were being lost (#1152).
    const icons = [soundButtonState(true, false).icon, soundButtonState(false, false).icon, soundButtonState(true, true).icon];
    expect(new Set(icons).size).toBe(3);
  });

  it("keeps blocked reading as pressed — the setting really is on", () => {
    expect(soundButtonState(true, true).active).toBe(true);
  });

  it("ignores the block when sound is off — off is off", () => {
    expect(soundButtonState(false, true)).toEqual({ icon: "volume_off", labelKey: "tips.toolbar.soundOff", active: false, tone: "accent" });
  });

  it("fills blocked as a warning, not as a selection — the glyph alone is not readable at 19px", () => {
    expect(soundButtonState(true, true).tone).toBe("warn");
    expect(soundButtonState(true, false).tone).toBe("accent");
  });

  it("tells the user what to do about it", () => {
    expect(said(true, true)).toContain("click");
  });
});
