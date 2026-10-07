// The physics of a celebration: every style starts, moves, and ends.
import { describe, expect, it } from "vitest";
import { CONFETTI_STYLES, type ConfettiStyle } from "../../../common/confetti";
import {
  alphaOf,
  MAX_PARTICLES,
  mergeShows,
  weightOf,
  spawnConfetti,
  spawnConfettiShow,
  stepParticles,
  type Particle,
} from "../../../src/utils/confettiParticles";

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

describe("spawnConfettiShow", () => {
  it.each(CONFETTI_STYLES)("%s repeats its burst in waves that start later", (style) => {
    const single = spawnConfetti(style, VIEWPORT, seeded(1));
    const show = spawnConfettiShow(style, VIEWPORT, seeded(1));
    expect(show.length).toBeGreaterThan(single.length);
    expect(Math.max(...show.map((particle) => particle.delay))).toBeGreaterThan(Math.max(...single.map((particle) => particle.delay)));
  });

  it.each(CONFETTI_STYLES)("%s lasts several seconds and still runs out", (style) => {
    const frames = framesUntilEmpty(spawnConfettiShow(style, VIEWPORT, seeded(4)), seeded(8));
    expect(frames / 60).toBeGreaterThan(4);
    expect(frames / 60).toBeLessThan(20);
  });
});

describe("mergeShows", () => {
  const showOf = (styles: readonly ConfettiStyle[], seed: number) => styles.flatMap((style) => spawnConfettiShow(style, VIEWPORT, seeded(seed)));

  it("keeps a single mixed press and the all-style finale whole", () => {
    expect(mergeShows([], showOf(["cracker", "sakura", "rain"], 1))).toHaveLength(showOf(["cracker", "sakura", "rain"], 1).length);
    expect(mergeShows([], showOf(CONFETTI_STYLES, 2))).toHaveLength(showOf(CONFETTI_STYLES, 2).length);
  });

  it("never exceeds the cap, however many presses pile up", () => {
    const piled = [1, 2, 3, 4, 5, 6].reduce<Particle[]>((live, seed) => mergeShows(live, showOf(["cracker", "sakura", "rain"], seed)), []);
    expect(piled.length).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(piled.length).toBeGreaterThan(MAX_PARTICLES - 400);
  });

  it("holds a pile of fireworks presses to the cap even after every rocket has burst", () => {
    const piled = Array.from({ length: 40 }, (_, seed) => seed).reduce<Particle[]>((live, seed) => mergeShows(live, showOf(["fireworks"], seed)), []);
    const peak = (particles: Particle[], frames: number, best: number): number => {
      if (frames === 0 || particles.length === 0) return best;
      const next = stepParticles(particles, FRAME, seeded(frames));
      return peak(next, frames - 1, Math.max(best, next.length));
    };
    expect(peak(piled, 60 * 12, piled.length)).toBeLessThanOrEqual(MAX_PARTICLES);
  });

  it("counts a rocket as the sparks it becomes", () => {
    const rocket = spawnConfettiShow("fireworks", VIEWPORT, seeded(1))[0];
    const paper = spawnConfetti("rain", VIEWPORT, seeded(1))[0];
    if (rocket === undefined || paper === undefined) throw new Error("no particle");
    expect(weightOf(paper)).toBe(1);
    expect(weightOf(rocket)).toBeGreaterThan(10);
  });

  it("does not cut what is already on screen, and trims the latest waves of the new show", () => {
    const existing = showOf(["rain"], 3);
    const incoming = showOf(CONFETTI_STYLES, 4);
    const merged = mergeShows(existing, incoming);
    expect(merged.slice(0, existing.length)).toEqual(existing);
    const kept = merged.slice(existing.length);
    const dropped = incoming.length - kept.length;
    expect(dropped).toBeGreaterThan(0);
    expect(Math.max(...kept.map((particle) => particle.delay))).toBeLessThanOrEqual(Math.max(...incoming.map((particle) => particle.delay)));
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
