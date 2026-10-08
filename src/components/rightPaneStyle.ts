// The flex style of a right pane beside the enlarged cell, split or full.
//
// `width: auto` while full because these panes carry their own w-[340px], which would outlive
// `flex: 1`. `min-width: 0` in both because a flex item's automatic minimum is its min-content
// width once its width is auto, so one unbreakable line in the content pushes the pane — and
// the buttons in its header — past the right edge of the window. GuiPanel's own min-w-0 is why
// the canvas never did this.

export interface RightPaneStyle {
  flex: string;
  width?: string;
  minWidth: string;
}

export const rightPaneStyle = (full: boolean, splitWidthPx: number): RightPaneStyle =>
  full ? { flex: "1 1 0%", width: "auto", minWidth: "0" } : { flex: `0 0 ${splitWidthPx}px`, minWidth: "0" };
