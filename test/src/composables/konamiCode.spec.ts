import { describe, expect, it } from "vitest";
import { advanceKonami, KONAMI_SEQUENCE } from "../../../src/composables/konamiCode";

const timesFired = (keys: readonly string[]): number =>
  keys.reduce(
    (state, key) => {
      const next = advanceKonami(state.progress, key);
      return { progress: next.progress, fired: state.fired + (next.done ? 1 : 0) };
    },
    { progress: 0, fired: 0 },
  ).fired;

describe("advanceKonami", () => {
  it("fires once on the full sequence and starts over", () => {
    expect(timesFired(KONAMI_SEQUENCE)).toBe(1);
    expect(advanceKonami(KONAMI_SEQUENCE.length - 1, "a")).toEqual({ progress: 0, done: true });
  });

  it("fires again on a second run", () => {
    expect(timesFired([...KONAMI_SEQUENCE, ...KONAMI_SEQUENCE])).toBe(2);
  });

  it("does not fire on a broken run", () => {
    expect(timesFired([...KONAMI_SEQUENCE.slice(0, 5), "x", ...KONAMI_SEQUENCE.slice(6)])).toBe(0);
  });

  it("lets a wrong key that is the first key begin a new run", () => {
    expect(timesFired(["ArrowUp", "ArrowUp", "ArrowUp", ...KONAMI_SEQUENCE.slice(1)])).toBe(1);
  });
});
