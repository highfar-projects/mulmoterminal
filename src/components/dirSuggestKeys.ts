// What a key does to the Working directory field's suggestion list. `highlighted` is -1 when no
// row is. "none" leaves the key to the field — Enter then launches, as it always has.
export type DirSuggestKeyAction = { kind: "move"; index: number } | { kind: "accept"; index: number } | { kind: "close" } | { kind: "none" };

export type DirSuggestKey = "ArrowUp" | "ArrowDown" | "Tab" | "Enter" | "Escape";

const NONE: DirSuggestKeyAction = { kind: "none" };

export function dirSuggestKeyAction(key: DirSuggestKey, highlighted: number, count: number): DirSuggestKeyAction {
  if (count === 0) return NONE;
  if (key === "ArrowDown") return { kind: "move", index: (highlighted + 1) % count };
  if (key === "ArrowUp") return { kind: "move", index: highlighted <= 0 ? count - 1 : highlighted - 1 };
  // Tab with nothing highlighted takes the first row, as a shell's completion does.
  if (key === "Tab") return { kind: "accept", index: Math.max(highlighted, 0) };
  if (key === "Enter") return highlighted >= 0 ? { kind: "accept", index: highlighted } : NONE;
  return { kind: "close" };
}
