export const KONAMI_SEQUENCE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"] as const;

/** Where a run of key presses stands: `progress` keys of the sequence matched so far, and whether
 *  `key` finished it. A wrong key starts over — but is itself the first key when it can be. */
export function advanceKonami(progress: number, key: string): { progress: number; done: boolean } {
  const restart = key === KONAMI_SEQUENCE[0] ? 1 : 0;
  const matched = key === KONAMI_SEQUENCE[progress] ? progress + 1 : restart;
  return matched === KONAMI_SEQUENCE.length ? { progress: 0, done: true } : { progress: matched, done: false };
}
