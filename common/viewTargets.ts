// The overlays an `open.view` header button can show. Shared so Settings offers exactly the ones the
// server loads.
export const VIEW_TARGETS = ["diff", "prs", "wiki", "collections", "accounting"] as const;
export type ViewTargetName = (typeof VIEW_TARGETS)[number];
export const isViewTargetName = (value: unknown): value is ViewTargetName => VIEW_TARGETS.some((view) => view === value);
