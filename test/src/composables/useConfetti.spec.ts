import { beforeEach, describe, expect, it } from "vitest";
import { confettiRequest, fireConfetti, fireConfettiFinale, fireConfettiForEvent, setConfetti } from "../../../src/composables/useConfetti";
import { CONFETTI_STYLES } from "../../../common/confetti";

const requestCount = () => confettiRequest.value?.id ?? 0;

describe("useConfetti", () => {
  beforeEach(() => setConfetti({ styles: ["sakura"], events: ["pr-merged"] }));

  it("picks from the configured styles", () => {
    fireConfetti(() => 0.5);
    expect(confettiRequest.value?.styles).toEqual(["sakura"]);
  });

  it("throws every style for the finale", () => {
    fireConfettiFinale();
    expect(confettiRequest.value?.styles).toEqual(CONFETTI_STYLES);
  });

  it("ignores an event the user did not opt in", () => {
    const before = requestCount();
    fireConfettiForEvent("turn-finished", 1_000_000);
    expect(requestCount()).toBe(before);
  });

  it("celebrates an opted-in event once inside the cooldown", () => {
    const before = requestCount();
    fireConfettiForEvent("pr-merged", 2_000_000);
    expect(requestCount()).toBe(before + 1);
    fireConfettiForEvent("pr-merged", 2_003_000);
    expect(requestCount()).toBe(before + 1);
    fireConfettiForEvent("pr-merged", 2_009_000);
    expect(requestCount()).toBe(before + 2);
  });
});
