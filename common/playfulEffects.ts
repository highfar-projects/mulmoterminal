// The `playfulEffects` setting and the heat a session reports to the browser. Both sides decide
// from it: the server skips measuring when it is "off" and sends the heat frame, the browser picks
// the picture and draws the level.
import { isRecord } from "./isRecord.js";

export const HEAT_PATTERNS = ["bomb", "volcano", "kettle", "rocket", "dynamite", "balloon", "skull"] as const;
export type HeatPattern = (typeof HEAT_PATTERNS)[number];
export const isHeatPattern = (value: unknown): value is HeatPattern => HEAT_PATTERNS.some((pattern) => pattern === value);

export type PlayfulEffects = HeatPattern | "random" | "off";
export const PLAYFUL_EFFECTS_DEFAULT: PlayfulEffects = "random";

/** Anything unrecognised is "unconfigured", which is what every config file written before this
 *  existed contains. `false` is honoured as "off" because it is what a person switching it off
 *  writes first. */
export function sanitizePlayfulEffects(input: unknown): PlayfulEffects {
  if (input === false || input === "off") return "off";
  if (input === "random" || isHeatPattern(input)) return input;
  return PLAYFUL_EFFECTS_DEFAULT;
}

/** 0 nothing, 1 appears, 2 lit, 3 hot, 4 critical. The finale is an event, not a level. */
export const HEAT_LEVELS = [0, 1, 2, 3, 4] as const;
export type HeatLevel = (typeof HEAT_LEVELS)[number];
export const isHeatLevel = (value: unknown): value is HeatLevel => HEAT_LEVELS.some((level) => level === value);

/** The `heat` frame: the session's level now, and whether it has just cooled off from a hot run. */
export interface HeatFrame {
  type: "heat";
  level: HeatLevel;
  finale: boolean;
}

export const heatFrameOf = (msg: unknown): { level: HeatLevel; finale: boolean } | null =>
  isRecord(msg) && msg.type === "heat" && isHeatLevel(msg.level) && typeof msg.finale === "boolean" ? { level: msg.level, finale: msg.finale } : null;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// FNV-1a: stable across reloads and browsers, so "random" gives each session its own picture that
// stays put, rather than one that changes on every re-render.
const hashOf = (text: string): number => [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), FNV_PRIME) >>> 0, FNV_OFFSET);

/** The picture for a session, or null when the setting is off. */
export function patternFor(sessionId: string, setting: PlayfulEffects): HeatPattern | null {
  if (setting === "off") return null;
  if (setting !== "random") return setting;
  return HEAT_PATTERNS[hashOf(sessionId) % HEAT_PATTERNS.length] ?? "bomb";
}
