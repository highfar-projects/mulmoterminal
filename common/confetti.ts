// The `confetti` setting: which kinds of celebration exist, and which app events set one off.
// Both sides decide from it — the server keeps it in the config, the browser draws.
import { isRecord } from "./isRecord.js";

export const CONFETTI_STYLES = ["cracker", "fireworks", "sakura", "rain", "balloons"] as const;
export type ConfettiStyle = (typeof CONFETTI_STYLES)[number];
export const isConfettiStyle = (value: unknown): value is ConfettiStyle => CONFETTI_STYLES.some((style) => style === value);

export const CONFETTI_EVENTS = ["pr-merged", "turn-finished", "command-done"] as const;
export type ConfettiEvent = (typeof CONFETTI_EVENTS)[number];
export const isConfettiEvent = (value: unknown): value is ConfettiEvent => CONFETTI_EVENTS.some((event) => event === value);

export interface Confetti {
  /** What a celebration may be; each one mixes a few picked at random from these. */
  styles: readonly ConfettiStyle[];
  /** Events that set one off by themselves. The keyboard shortcut and the palette work regardless. */
  events: readonly ConfettiEvent[];
}

export const CONFETTI_DEFAULT: Confetti = { styles: CONFETTI_STYLES, events: [] };

const onlyKnown = <T>(input: unknown, isKnown: (value: unknown) => value is T): T[] => (Array.isArray(input) ? [...new Set(input.filter(isKnown))] : []);

/** Anything unrecognised is "unconfigured". An empty or all-unknown `styles` falls back to every
 *  style rather than to none: a celebration that can draw nothing is a shortcut that silently
 *  does nothing. `events` has no such fallback — empty is how it is switched off. */
export function sanitizeConfetti(input: unknown): Confetti {
  if (!isRecord(input)) return CONFETTI_DEFAULT;
  const styles = onlyKnown(input.styles, isConfettiStyle);
  return { styles: styles.length > 0 ? styles : CONFETTI_STYLES, events: onlyKnown(input.events, isConfettiEvent) };
}

/** How many styles one celebration mixes, when the list has that many. */
export const CONFETTI_MIX_COUNT = 3;

/** `count` different styles at random from `styles` (all of them when there are fewer);
 *  `random` is injected so a spec can walk every choice. */
export function pickConfettiMix(styles: readonly ConfettiStyle[], count: number, random: () => number): ConfettiStyle[] {
  const pool = [...(styles.length > 0 ? styles : CONFETTI_STYLES)];
  return Array.from(
    { length: Math.min(count, pool.length) },
    () => pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0] ?? "cracker",
  );
}

/** One style at random from `styles`; `random` is injected so a spec can walk every choice. */
export function pickConfettiStyle(styles: readonly ConfettiStyle[], random: () => number): ConfettiStyle {
  const pool = styles.length > 0 ? styles : CONFETTI_STYLES;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? "cracker";
}
