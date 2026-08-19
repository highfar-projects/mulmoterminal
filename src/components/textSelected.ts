// A click that ENDS a drag-selection must not act on the row under it: the reader is copying the
// text, and collapsing the row takes away what they just selected.
//
// Typed structurally rather than as a DOM `Selection` so it can be tested without one — the
// browser's own object satisfies it.
type SelectionLike = { isCollapsed: boolean; toString: () => string };

export const isTextSelected = (selection: SelectionLike | null | undefined): boolean =>
  !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
