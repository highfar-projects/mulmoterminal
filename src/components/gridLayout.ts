// Grid layout definitions shared by App (the picker) and TerminalGrid.

// Ordered smallest→largest: the grid grows through these as terminals are added.
export const LAYOUTS = ["1", "2", "2x2", "3x2", "4x2", "3x3"] as const;
export type Layout = (typeof LAYOUTS)[number];

// cols × rows per layout. Max cells is 9 (3x3), which bounds the persisted arrays.
const DIMS: Record<Layout, { cols: number; rows: number }> = {
  "1": { cols: 1, rows: 1 },
  "2": { cols: 2, rows: 1 },
  "2x2": { cols: 2, rows: 2 },
  "3x2": { cols: 3, rows: 2 },
  "4x2": { cols: 4, rows: 2 },
  "3x3": { cols: 3, rows: 3 },
};

export const MAX_CELLS = 9;

export function isLayout(v: unknown): v is Layout {
  return typeof v === "string" && LAYOUTS.some((layout) => layout === v);
}

export function dims(layout: Layout) {
  const { cols, rows } = DIMS[layout];
  return { cols, rows, cellCount: cols * rows };
}

// The smallest layout whose cells fit `count` terminals (clamped to 1..MAX_CELLS).
// Drives the auto-growing grid: 1→"1", 2→"2", 3-4→"2x2", 5-6→"3x2", 7-8→"4x2", 9→"3x3".
export function layoutForCount(count: number): Layout {
  const n = Math.max(1, Math.min(MAX_CELLS, Math.floor(count)));
  return LAYOUTS.find((l) => dims(l).cellCount >= n) ?? "3x3";
}

// CSS grid track template for the layout: equal tracks, one per cell.
export function trackStyle(layout: Layout) {
  const { cols, rows } = dims(layout);
  const tracks = (count: number) => Array.from({ length: count }, () => "1fr").join(" ");
  return { gridTemplateColumns: tracks(cols), gridTemplateRows: tracks(rows), gap: "6px" };
}

// The card-stack arrangement's floor: below this, a tile stops shrinking and the surplus
// starts overlapping instead (see stackLayout). Not a UI setting yet — a fixed default that
// keeps a terminal legible.
export const MIN_STACK_CARD_WIDTH_PX = 400;
// Below this, a covered card's exposed strip is too thin to read at all (no room for even an
// icon and a couple of characters) — stackGrid wraps to another row instead of overlapping past
// it. Raised after shipping an earlier, uncapped-overlap version: with enough terminals open,
// cards kept overlapping until there was nothing left to see.
export const MIN_STACK_VISIBLE_PX = 140;
// Matches trackStyle's own gap, so the two arrangements read as the same spacing system.
const STACK_GAP_PX = 6;

/**
 * How wide a card-stack tile should be, and the horizontal margin to put between one and the
 * next, for `count` cells in a container `containerWidthPx` wide. `gapPx` is signed: positive is
 * plain spacing (the ample case), negative is overlap (applied as that card's own
 * `margin-left`) — one value, one CSS property, no separate "gap vs overlap" branch anywhere
 * that reads it.
 *
 * Ample width (an even share, after `STACK_GAP_PX` of normal spacing between each pair, is still
 * >= `minWidthPx`): every card gets that share and `gapPx` is plain spacing — this is the "3 or 4
 * columns" case the feature is named for.
 *
 * Tight width: every card holds `minWidthPx` and `gapPx` goes negative, distributing the surplus
 * as overlap — enough that `count` cards always fit inside `containerWidthPx` exactly, whatever
 * that takes. Uncapped on its own: this is the per-ROW primitive `stackGrid` calls with a row
 * size it already chose to keep the overlap legible (see `MIN_STACK_VISIBLE_PX`) — a caller that
 * wants that guarantee should go through `stackGrid`, not this function directly.
 *
 * A single cell has nothing to overlap against, so it simply fills the container — the same
 * degenerate case `trackStyle`'s own 1-cell `1fr` track already has.
 */
export function stackLayout(containerWidthPx: number, count: number, minWidthPx: number = MIN_STACK_CARD_WIDTH_PX): { cardWidthPx: number; gapPx: number } {
  const n = Math.max(1, Math.floor(count));
  // Not measured yet (or a hidden/zero-size container) — the floor width is a saner first paint
  // than dividing by an unmeasured 0, which would collapse every card to nothing.
  if (containerWidthPx <= 0) return { cardWidthPx: minWidthPx, gapPx: STACK_GAP_PX };
  if (n === 1) return { cardWidthPx: containerWidthPx, gapPx: STACK_GAP_PX };
  const evenSharePx = (containerWidthPx - STACK_GAP_PX * (n - 1)) / n;
  if (evenSharePx >= minWidthPx) return { cardWidthPx: evenSharePx, gapPx: STACK_GAP_PX };
  const excessPx = minWidthPx * n - containerWidthPx;
  return { cardWidthPx: minWidthPx, gapPx: -(excessPx / (n - 1)) };
}

/** A covered card's actually-visible width — its own width minus however much overlap eats into
 * it. `gapPx` is only ever negative (overlap) or positive (plain spacing, nothing eaten), so this
 * is `cardWidthPx` itself in the plain-spacing case. */
const visibleStripPx = ({ cardWidthPx, gapPx }: { cardWidthPx: number; gapPx: number }): number => cardWidthPx + Math.min(gapPx, 0);

/**
 * The card-stack arrangement, wrapping to another row rather than overlapping a covered card
 * past `MIN_STACK_VISIBLE_PX`. `cols` is how many cards `stackLayout` was asked to fit per row —
 * every row uses the SAME `cols`/`cardWidthPx` (a trailing partial row is fewer cards at that
 * same width, not a wider recompute for just those few) so every card in the arrangement reads as
 * one consistent size, not the row it happens to fall in.
 *
 * `cols` only ever grows as width increases or shrinks as it decreases — `stackLayout`'s own
 * visible strip shrinks monotonically as more cards share one row (each one only ever costs the
 * row more competition for the same space), so the first row size that fails the floor means every
 * larger one does too, and it is enough to stop there.
 */
export function stackGrid(
  containerWidthPx: number,
  count: number,
  minWidthPx: number = MIN_STACK_CARD_WIDTH_PX,
  minVisiblePx: number = MIN_STACK_VISIBLE_PX,
): { cols: number; cardWidthPx: number; gapPx: number } {
  const n = Math.max(1, Math.floor(count));
  // Not measured yet: stackLayout's own "not measured" branch answers the same floor width for
  // ANY count (there is no real width to divide), which would otherwise look like every column
  // "fits" and hand back cols: n — a wide flash of the wrong layout the instant a real width
  // arrives. One column is the safe first paint, same reasoning as stackLayout's own.
  if (containerWidthPx <= 0) return { cols: 1, ...stackLayout(containerWidthPx, 1, minWidthPx) };
  let cols = 1;
  for (let c = 2; c <= n; c++) {
    if (visibleStripPx(stackLayout(containerWidthPx, c, minWidthPx)) < minVisiblePx) break;
    cols = c;
  }
  return { cols, ...stackLayout(containerWidthPx, cols, minWidthPx) };
}
