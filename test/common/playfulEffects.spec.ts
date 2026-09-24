// The setting's reading on both sides, the heat frame's shape, and "random" meaning a picture per
// session that stays put.
import { describe, it, expect } from "vitest";
import { HEAT_PATTERNS, heatFrameOf, patternFor, sanitizePlayfulEffects } from "../../common/playfulEffects";

describe("sanitizePlayfulEffects", () => {
  it.each([
    ["off", "off"],
    [false, "off"],
    ["random", "random"],
    ["rocket", "rocket"],
  ])("keeps %j as %j", (input, expected) => {
    expect(sanitizePlayfulEffects(input)).toBe(expected);
  });

  it.each([undefined, null, true, "", "Rocket", "nuke", 3, {}])("reads %j as the default", (input) => {
    expect(sanitizePlayfulEffects(input)).toBe("random");
  });
});

describe("heatFrameOf", () => {
  it("reads a heat frame", () => {
    expect(heatFrameOf({ type: "heat", level: 3, finale: false })).toEqual({ level: 3, finale: false });
    expect(heatFrameOf({ type: "heat", level: 0, finale: true })).toEqual({ level: 0, finale: true });
  });

  it.each([
    null,
    "heat",
    { type: "paneMode", level: 1, finale: false },
    { type: "heat", level: 5, finale: false },
    { type: "heat", level: -1, finale: false },
    { type: "heat", level: "2", finale: false },
    { type: "heat", level: 2 },
    { type: "heat", level: 2, finale: "yes" },
  ])("refuses %j", (msg) => {
    expect(heatFrameOf(msg)).toBeNull();
  });
});

describe("patternFor", () => {
  it("is nothing when switched off", () => {
    expect(patternFor("abc", "off")).toBeNull();
  });

  it("is the named picture everywhere when one is named", () => {
    expect(patternFor("abc", "kettle")).toBe("kettle");
    expect(patternFor("xyz", "kettle")).toBe("kettle");
  });

  it("gives the same session the same picture every time", () => {
    expect(patternFor("2c44312a-b80d-4d16-89e9-34742a291261", "random")).toBe(patternFor("2c44312a-b80d-4d16-89e9-34742a291261", "random"));
  });

  it("spreads sessions across every picture", () => {
    const ids = Array.from({ length: 400 }, (_, index) => `session-${index}`);
    const seen = new Set(ids.map((id) => patternFor(id, "random")));
    expect([...seen].sort()).toEqual([...HEAT_PATTERNS].sort());
  });
});
