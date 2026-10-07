// The physics of a celebration: every style starts, moves, and ends.
import { describe, expect, it } from "vitest";
import { CONFETTI_STYLES } from "../../../common/confetti";
import { alphaOf, spawnConfetti, stepParticles, type Particle } from "../../../src/utils/confettiParticles";

const VIEWPORT = { width: 1200, height: 800 };
const FRAME = 1 / 60;
const MAX_FRAMES = 60 * 30;
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_MODULUS = 4294967296;

const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return state / LCG_MODULUS;
  };
};

const framesUntilEmpty = (particles: Particle[], random: () => number): number => {
  const run = (alive: Particle[], frames: number): number => {
    if (alive.length === 0) return frames;
    return frames >= MAX_FRAMES ? -1 : run(stepParticles(alive, FRAME, random), frames + 1);
  };
  return run(particles, 0);
};

describe("spawnConfetti", () => {
  it.each(CONFETTI_STYLES)("%s makes particles with a life and no NaN", (style) => {
    const particles = spawnConfetti(style, VIEWPORT, seeded(7));
    expect(particles.length).toBeGreaterThan(0);
    particles.forEach((particle) => {
      expect(particle.life).toBeGreaterThan(0);
      expect(
        Object.values(particle)
          .filter((value) => typeof value === "number")
          .every(Number.isFinite),
      ).toBe(true);
    });
  });

  it("is the same burst for the same random source", () => {
    expect(spawnConfetti("cracker", VIEWPORT, seeded(3))).toEqual(spawnConfetti("cracker", VIEWPORT, seeded(3)));
  });
});

describe("stepParticles", () => {
  it.each(CONFETTI_STYLES)("%s runs out within a few seconds", (style) => {
    const frames = framesUntilEmpty(spawnConfetti(style, VIEWPORT, seeded(11)), seeded(5));
    expect(frames).toBeGreaterThan(0);
    expect(frames / 60).toBeLessThan(12);
  });

  it("holds a delayed particle where it is until its turn", () => {
    const waiting = spawnConfetti("sakura", VIEWPORT, () => 0.99)[0];
    if (waiting === undefined) throw new Error("no particle");
    const [after] = stepParticles([waiting], FRAME, seeded(1));
    expect(after?.x).toBe(waiting.x);
    expect(after?.y).toBe(waiting.y);
    expect(after?.age).toBe(0);
  });

  it("leaves a burst of sparks where a rocket ends, and not before", () => {
    const rocket = spawnConfetti("fireworks", VIEWPORT, () => 0)[0];
    if (rocket === undefined) throw new Error("no rocket");
    const live = { ...rocket, delay: 0 };
    expect(stepParticles([live], FRAME, seeded(2))).toHaveLength(1);
    const burst = stepParticles([{ ...live, age: live.life - FRAME / 2 }], FRAME, seeded(2));
    expect(burst.length).toBeGreaterThan(10);
    expect(burst.every((particle) => particle.shape === "spark")).toBe(true);
  });

  it("does not change what it was given", () => {
    const particles = spawnConfetti("rain", VIEWPORT, seeded(9));
    const copy = structuredClone(particles);
    stepParticles(particles, FRAME, seeded(1));
    expect(particles).toEqual(copy);
  });
});

describe("alphaOf", () => {
  it("is solid while young and gone at the end", () => {
    const particle = spawnConfetti("rain", VIEWPORT, seeded(1))[0];
    if (particle === undefined) throw new Error("no particle");
    expect(alphaOf({ ...particle, age: 0 })).toBe(1);
    expect(alphaOf({ ...particle, age: particle.life })).toBe(0);
    const fading = alphaOf({ ...particle, age: particle.life * 0.9 });
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);
  });
});
