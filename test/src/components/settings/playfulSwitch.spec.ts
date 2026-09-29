import { describe, it, expect } from "vitest";
import { HEAT_PATTERNS, type PlayfulEffects } from "../../../../common/playfulEffects";
import { playfulAfterSwitch, playfulIsOn } from "../../../../src/components/settings/playfulSwitch";

const EVERY_SETTING: readonly PlayfulEffects[] = ["off", "random", ...HEAT_PATTERNS];

describe("playfulSwitch", () => {
  it("reads as on for everything but off", () => {
    EVERY_SETTING.forEach((setting) => expect(playfulIsOn(setting)).toBe(setting !== "off"));
  });

  it("switching off always writes off", () => {
    EVERY_SETTING.forEach((setting) => expect(playfulAfterSwitch(setting, false)).toBe("off"));
  });

  it("switching on keeps a picture chosen in the file, and turns off into random", () => {
    EVERY_SETTING.forEach((setting) => expect(playfulAfterSwitch(setting, true)).toBe(setting === "off" ? "random" : setting));
  });

  it("an on switch always reads back as on", () => {
    EVERY_SETTING.forEach((setting) => expect(playfulIsOn(playfulAfterSwitch(setting, true))).toBe(true));
  });
});
