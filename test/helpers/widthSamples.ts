// Rows the width ground-truth specs print, for tmux and for psmux: fixed ones that have each been a
// disagreement, and seeded random ones, so a failing sample is the same one on every run.
export const RANDOM_SEED = 3173;
const RANDOM_SAMPLES = 20;
const CHARACTERS_PER_RANDOM_SAMPLE = 6;
const RANDOM_CODEPOINT_SPAN = 0x1fa00;

export const FIXED_WIDTH_SAMPLES: readonly string[] = [
  "[✅]",
  "⏺ done",
  "│ ✅ │ ok │",
  "\u{1f468}‍\u{1f469}‍\u{1f467}",
  "\u{1f1ef}\u{1f1f5}\u{1f1fa}",
  "\u{1f44d}\u{1f3fd}\u{1f3fd}",
  "a\u{1f3fd}",
  "☺️x",
  "✅︎x",
  "a‍\u{1f469}b",
  "\u{1f468}‍a",
  "각",
  "あい",
  "\u{1fae0}x",
  "\u{1f93b}x",
  "é́",
  "1️⃣",
  "ℹ️ i",
  "\u{1f3f3}️‍\u{1f308}",
  "\u{1f9d1}\u{1f3fd}‍\u{1f4bb}",
  // Over a cell's byte cap: 25 bytes (past tmux 3.4/3.5's 21) and 41 (past 32).
  "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}x",
  "\u{1f468}\u{1f3fd}\u200d\u{1f469}\u{1f3fd}\u200d\u{1f467}\u{1f3fd}\u200d\u{1f466}\u{1f3fd}x",
  "\u{1f469}\u200d\u2764\ufe0f\u200d\u{1f48b}\u200d\u{1f468}\u200d\u{1f467}\u200d\u{1f466}x",
];

export function seededWidthSamples(seed: number): string[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
  return Array.from({ length: RANDOM_SAMPLES }, () =>
    String.fromCodePoint(
      ...Array.from({ length: CHARACTERS_PER_RANDOM_SAMPLE }, () => 0xa0 + Math.floor(next() * RANDOM_CODEPOINT_SPAN)).filter(
        (codepoint) => codepoint < 0xd800 || codepoint > 0xdfff,
      ),
    ),
  );
}
