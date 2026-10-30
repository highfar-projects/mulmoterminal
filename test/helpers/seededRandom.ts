// The source of generated test inputs, so a failing case is found again by its seed. The step is
// 32-bit arithmetic on purpose: in a double the product of a 31-bit state and the multiplier is
// rounded, the state then sits on multiples of a power of two, and the period falls from two
// billion to a few thousand draws. Values come from the upper bits, which a congruential step
// randomises and the low ones it does not.
export const LCG_MULTIPLIER = 1103515245;
const LCG_INCREMENT = 12345;
const LOW_BITS_DROPPED = 8;
const RANGE = 2 ** (32 - LOW_BITS_DROPPED);

export interface SeededRandom {
  /** A fraction in [0, 1). */
  fraction(): number;
  /** An integer in [0, bound). */
  below(bound: number): number;
  /** One of `choices`; a spec picking from none is a spec bug, so it throws rather than answer. */
  pick<T>(choices: readonly T[]): T;
}

export function seededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  const fraction = (): number => {
    state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return (state >>> LOW_BITS_DROPPED) / RANGE;
  };
  const below = (bound: number): number => Math.floor(fraction() * bound);
  const pick = <T>(choices: readonly T[]): T => {
    if (choices.length === 0) throw new Error("seededRandom.pick: nothing to pick from");
    return choices[below(choices.length)];
  };
  return { fraction, below, pick };
}
