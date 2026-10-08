// What the `confetti` setting accepts, and that a style pick can reach every style.
import { describe, expect, it } from "vitest";
import { CONFETTI_DEFAULT, CONFETTI_EVENTS, CONFETTI_STYLES, pickConfettiMix, pickConfettiStyle, sanitizeConfetti } from "../../common/confetti";

describe("sanitizeConfetti", () => {
  it.each([undefined, null, "sakura", 3, [], true])("reads %j as unconfigured", (input) => {
    expect(sanitizeConfetti(input)).toEqual(CONFETTI_DEFAULT);
  });

  it("keeps the styles and events it knows, in order, once each", () => {
    expect(sanitizeConfetti({ styles: ["sakura", "cracker", "sakura"], events: ["pr-merged", "pr-merged"] })).toEqual({
      styles: ["sakura", "cracker"],
      events: ["pr-merged"],
    });
  });

  it("drops what it does not know", () => {
    expect(sanitizeConfetti({ styles: ["sakura", "glitter", 4], events: ["pr-merged", "lunch"] })).toEqual({ styles: ["sakura"], events: ["pr-merged"] });
  });

  it("falls back to every style when none is usable, but leaves events empty", () => {
    expect(sanitizeConfetti({ styles: [], events: [] })).toEqual({ styles: CONFETTI_STYLES, events: [] });
    expect(sanitizeConfetti({ styles: ["nope"], events: "pr-merged" })).toEqual({ styles: CONFETTI_STYLES, events: [] });
  });

  it("is off for every event by default", () => {
    expect(CONFETTI_DEFAULT.events).toEqual([]);
    expect(CONFETTI_EVENTS.length).toBeGreaterThan(0);
  });
});

describe("pickConfettiStyle", () => {
  it("can reach every style, and never steps past the end", () => {
    const picked = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.9999999, 1].map((roll) => pickConfettiStyle(CONFETTI_STYLES, () => roll)));
    expect([...picked].sort()).toEqual([...CONFETTI_STYLES].sort());
  });

  it("stays inside a narrowed list", () => {
    expect(pickConfettiStyle(["sakura"], () => 0.7)).toBe("sakura");
  });

  it("uses every style when handed an empty list", () => {
    expect(CONFETTI_STYLES).toContain(pickConfettiStyle([], () => 0.5));
  });
});

describe("pickConfettiMix", () => {
  it.each([0, 0.3, 0.7, 0.9999999])("gives %d-seeded picks that are all different", (roll) => {
    const mix = pickConfettiMix(CONFETTI_STYLES, 3, () => roll);
    expect(mix).toHaveLength(3);
    expect(new Set(mix).size).toBe(3);
  });

  it("returns what there is when the list is shorter than the count", () => {
    expect(pickConfettiMix(["sakura", "rain"], 3, () => 0.5).sort()).toEqual(["rain", "sakura"]);
  });

  it("uses every style when handed an empty list", () => {
    expect(pickConfettiMix([], 5, () => 0.2).sort()).toEqual([...CONFETTI_STYLES].sort());
  });
});
