import { describe, expect, it } from "vitest";
import { CONFETTI_DEFAULT, CONFETTI_EVENTS, CONFETTI_STYLES, sanitizeConfetti, type Confetti } from "../../../../common/confetti";
import { confettiAfterEvent, confettiAfterStyle, confettiStyleLocked } from "../../../../src/components/settings/confettiSwitch";

describe("confettiAfterStyle", () => {
  it("switches a style off and keeps the catalogue's order when it comes back", () => {
    const off = confettiAfterStyle(CONFETTI_DEFAULT, "sakura", false);
    expect(off.styles).not.toContain("sakura");
    expect(confettiAfterStyle(off, "sakura", true).styles).toEqual(CONFETTI_STYLES);
  });

  it("never leaves the list empty", () => {
    const one: Confetti = { styles: ["rain"], events: [] };
    expect(confettiAfterStyle(one, "rain", false).styles).toEqual(["rain"]);
  });

  it("is a no-op for a style already on", () => {
    expect(confettiAfterStyle(CONFETTI_DEFAULT, "rain", true).styles).toEqual(CONFETTI_STYLES);
  });

  it("leaves the events alone, and every result reads back the same from the server's sanitizer", () => {
    CONFETTI_STYLES.forEach((style) => {
      const next = confettiAfterStyle({ styles: CONFETTI_STYLES, events: ["pr-merged"] }, style, false);
      expect(next.events).toEqual(["pr-merged"]);
      expect(sanitizeConfetti(next)).toEqual(next);
    });
  });
});

describe("confettiAfterEvent", () => {
  it("turns events on in catalogue order and off again", () => {
    const on = confettiAfterEvent(confettiAfterEvent(CONFETTI_DEFAULT, "command-done", true), "pr-merged", true);
    expect(on.events).toEqual(["pr-merged", "command-done"]);
    expect(confettiAfterEvent(on, "pr-merged", false).events).toEqual(["command-done"]);
  });

  it("can switch every event off, which is how they are off", () => {
    const all = CONFETTI_EVENTS.reduce((setting, event) => confettiAfterEvent(setting, event, true), CONFETTI_DEFAULT);
    expect(CONFETTI_EVENTS.reduce((setting, event) => confettiAfterEvent(setting, event, false), all).events).toEqual([]);
  });
});

describe("confettiStyleLocked", () => {
  it("locks only the last style left", () => {
    expect(confettiStyleLocked(CONFETTI_DEFAULT, "rain")).toBe(false);
    expect(confettiStyleLocked({ styles: ["rain"], events: [] }, "rain")).toBe(true);
    expect(confettiStyleLocked({ styles: ["rain"], events: [] }, "sakura")).toBe(false);
  });
});
