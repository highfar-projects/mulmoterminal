// The physics of a celebration, with no canvas in it: how each style starts, and how a particle
// moves one frame. `random` is injected so a spec can pin a whole burst, and drawing lives in
// confettiDraw.ts so none of this needs a browser.
import type { ConfettiStyle } from "../../common/confetti";

export type ParticleShape = "paper" | "dot" | "petal" | "spark" | "balloon" | "rocket";

export interface Particle {
  shape: ParticleShape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Added to vy each second, in px/s^2. */
  gravity: number;
  /** Share of velocity kept after one second; below 1 the particle slows. */
  drag: number;
  /** Horizontal wobble amplitude in px/s, and how fast it oscillates. */
  sway: number;
  swayRate: number;
  swayPhase: number;
  size: number;
  color: string;
  angle: number;
  spin: number;
  /** Seconds before it exists at all, so one burst arrives as a stream rather than a block. */
  delay: number;
  age: number;
  life: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type Random = () => number;

const PAPER_COLORS = ["#ff3b6b", "#ffb400", "#2ec4b6", "#4d96ff", "#b46bff", "#7ddc4a", "#ff7a3d"] as const;
const PETAL_COLORS = ["#ffb7c5", "#ff9ec4", "#ffd1dc", "#ff86a8"] as const;
const FADE_SHARE = 0.25;
const TWO_PI = Math.PI * 2;

const range = (random: Random, min: number, max: number): number => min + random() * (max - min);
const pick = <T>(random: Random, items: readonly [T, ...T[]]): T => items.at(Math.min(items.length - 1, Math.floor(random() * items.length))) ?? items[0];

const base = (overrides: Partial<Particle> & Pick<Particle, "shape" | "x" | "y" | "color" | "life">): Particle => ({
  vx: 0,
  vy: 0,
  gravity: 0,
  drag: 1,
  sway: 0,
  swayRate: 0,
  swayPhase: 0,
  size: 8,
  angle: 0,
  spin: 0,
  delay: 0,
  age: 0,
  ...overrides,
});

function spawnCracker({ width, height }: Viewport, random: Random): Particle[] {
  return [-1, 1].flatMap((side) =>
    Array.from({ length: 80 }, () => {
      const lean = range(random, -0.3, 0.9);
      const speed = range(random, 500, 1250);
      const inward = side < 0 ? 1 : -1;
      return base({
        shape: random() < 0.2 ? "dot" : "paper",
        x: side < 0 ? 0 : width,
        y: height,
        vx: inward * Math.sin(lean) * speed,
        vy: -Math.cos(lean) * speed,
        gravity: 700,
        drag: 0.3,
        sway: range(random, 0, 30),
        swayRate: range(random, 3, 7),
        swayPhase: range(random, 0, TWO_PI),
        size: range(random, 6, 12),
        color: pick(random, PAPER_COLORS),
        angle: range(random, 0, TWO_PI),
        spin: range(random, -12, 12),
        life: range(random, 2.2, 3.4),
      });
    }),
  );
}

function spawnFireworks({ width, height }: Viewport, random: Random): Particle[] {
  return Array.from({ length: 5 }, (_, index) => {
    const life = range(random, 0.8, 1.1);
    const peak = range(random, height * 0.2, height * 0.45);
    return base({
      shape: "rocket",
      x: range(random, width * 0.15, width * 0.85),
      y: height,
      vy: -(height - peak) / life,
      size: 3,
      color: pick(random, PAPER_COLORS),
      delay: index * 0.45 + range(random, 0, 0.2),
      life,
    });
  });
}

function spawnBurst(rocket: Particle, random: Random): Particle[] {
  return Array.from({ length: 70 }, () => {
    const direction = range(random, 0, TWO_PI);
    const speed = range(random, 80, 380);
    return base({
      shape: "spark",
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      gravity: 220,
      drag: 0.5,
      size: range(random, 2, 3.5),
      color: random() < 0.25 ? "#ffd36b" : rocket.color,
      life: range(random, 0.9, 1.5),
    });
  });
}

const fallLife = (distance: number, speed: number, cap: number): number => Math.min(cap, distance / speed);

function spawnSakura({ width, height }: Viewport, random: Random): Particle[] {
  return Array.from({ length: 90 }, () => {
    const vy = range(random, 160, 260);
    return base({
      shape: "petal",
      x: range(random, 0, width),
      y: range(random, -40, -10),
      vx: range(random, -20, 40),
      vy,
      sway: range(random, 25, 60),
      swayRate: range(random, 1.5, 3),
      swayPhase: range(random, 0, TWO_PI),
      size: range(random, 7, 12),
      color: pick(random, PETAL_COLORS),
      angle: range(random, 0, TWO_PI),
      spin: range(random, -3, 3),
      delay: range(random, 0, 1.6),
      life: fallLife(height + 60, vy, 6.5),
    });
  });
}

function spawnRain({ width, height }: Viewport, random: Random): Particle[] {
  return Array.from({ length: 220 }, () => {
    const vy = range(random, 300, 550);
    return base({
      shape: "paper",
      x: range(random, 0, width),
      y: range(random, -30, -8),
      vx: range(random, -60, 60),
      vy,
      gravity: 200,
      sway: range(random, 10, 40),
      swayRate: range(random, 2, 5),
      swayPhase: range(random, 0, TWO_PI),
      size: range(random, 6, 11),
      color: pick(random, PAPER_COLORS),
      angle: range(random, 0, TWO_PI),
      spin: range(random, -14, 14),
      delay: range(random, 0, 1.2),
      life: fallLife(height + 40, vy, 4),
    });
  });
}

function spawnBalloons({ width, height }: Viewport, random: Random): Particle[] {
  return Array.from({ length: 16 }, () => {
    const rise = range(random, 160, 260);
    return base({
      shape: "balloon",
      x: range(random, width * 0.05, width * 0.95),
      y: height + 60,
      vy: -rise,
      sway: range(random, 15, 35),
      swayRate: range(random, 1, 2),
      swayPhase: range(random, 0, TWO_PI),
      size: range(random, 22, 34),
      color: pick(random, PAPER_COLORS),
      delay: range(random, 0, 1.4),
      life: fallLife(height + 160, rise, 7),
    });
  });
}

const SPAWN: Record<ConfettiStyle, (viewport: Viewport, random: Random) => Particle[]> = {
  cracker: spawnCracker,
  fireworks: spawnFireworks,
  sakura: spawnSakura,
  rain: spawnRain,
  balloons: spawnBalloons,
};

export const spawnConfetti = (style: ConfettiStyle, viewport: Viewport, random: Random): Particle[] => SPAWN[style](viewport, random);

// One press is a show, not a puff: the same burst repeated in waves, each starting `gapSeconds`
// after the last, sized so every style fills the screen for several seconds.
const SHOW: Record<ConfettiStyle, { waves: number; gapSeconds: number }> = {
  cracker: { waves: 5, gapSeconds: 1.1 },
  fireworks: { waves: 3, gapSeconds: 2.2 },
  sakura: { waves: 4, gapSeconds: 1.8 },
  rain: { waves: 4, gapSeconds: 1.5 },
  balloons: { waves: 3, gapSeconds: 2 },
};

export function spawnConfettiShow(style: ConfettiStyle, viewport: Viewport, random: Random): Particle[] {
  const { waves, gapSeconds } = SHOW[style];
  return Array.from({ length: waves }, (_, wave) =>
    spawnConfetti(style, viewport, random).map((particle) => ({ ...particle, delay: particle.delay + wave * gapSeconds })),
  ).flat();
}

function advance(particle: Particle, seconds: number): Particle {
  const keep = Math.pow(particle.drag, seconds);
  const vx = particle.vx * keep;
  const vy = particle.vy * keep + particle.gravity * seconds;
  const age = particle.age + seconds;
  const wobble = particle.sway * Math.sin(particle.swayPhase + age * particle.swayRate);
  return { ...particle, vx, vy, age, x: particle.x + (vx + wobble) * seconds, y: particle.y + vy * seconds, angle: particle.angle + particle.spin * seconds };
}

/** One frame: waiting particles count down, live ones move, finished ones go — a rocket leaving a
 *  burst of sparks where it stopped. A new array; the input is not touched. */
export function stepParticles(particles: readonly Particle[], seconds: number, random: Random): Particle[] {
  return particles.flatMap((particle): Particle[] => {
    if (particle.delay > 0) return [{ ...particle, delay: particle.delay - seconds }];
    const next = advance(particle, seconds);
    if (next.age < next.life) return [next];
    return next.shape === "rocket" ? spawnBurst(next, random) : [];
  });
}

// A press during a show adds to it, so mashing the key keeps the screen full; this caps what the
// canvas has to draw. A single mixed press and the all-style finale both fit under it.
export const MAX_PARTICLES = 2500;

/** `incoming` added after `existing`, trimmed from its latest waves so the total stays within
 *  `MAX_PARTICLES`; `existing` is never cut, so a show already on screen is not clipped. */
export function mergeShows(existing: readonly Particle[], incoming: readonly Particle[]): Particle[] {
  const room = Math.max(0, MAX_PARTICLES - existing.length);
  const kept = [...incoming].sort((a, b) => a.delay - b.delay).slice(0, room);
  return [...existing, ...kept];
}

/** 1 while a particle is young, falling to 0 over the last part of its life. */
export const alphaOf = (particle: Particle): number => Math.max(0, Math.min(1, (particle.life - particle.age) / (particle.life * FADE_SHARE)));

/** Whether anything is left to draw or still to arrive. */
export const isFinished = (particles: readonly Particle[]): boolean => particles.length === 0;
