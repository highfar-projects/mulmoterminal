// How a `role="tab"` strip answers the keyboard, shared by every strip in the app so the chat tabs
// and the Files tabs cannot drift apart. `role="tab"` is a promise about the keyboard, not just a
// label: arrows move between tabs, Home and End reach the ends, and only the selected tab is in the
// tab order so Tab leaves the strip rather than walking it (Codex, PR #2002).
const KEY_STEPS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

/** The tab a key moves to, or null when the key is not ours — the handler must not preventDefault
 *  then, or the strip would swallow Tab and Escape while focused. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  const step = KEY_STEPS[key];
  if (step !== undefined) return (index + step + count) % count;
  if (key === "Home") return 0;
  return key === "End" ? count - 1 : null;
}
