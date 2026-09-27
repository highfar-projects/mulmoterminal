// What the cockpit roster row's ⋮ menu offers (#2299), decided from the row alone.
//
// Unread/read needs a terminal that holds a session: a command or launcher cell manages no
// attention (terminalManagesAttention), and a cell still on its launch form has nothing to mark.
// Set aside is a TerminalCell's, the one cell type whose header offers it.
import type { AttentionStatus } from "./attentionStatus";

export type AttentionAction = "unread" | "read";

/** The row's top item: idle can be marked unread, a waiting row read, a running one neither. */
export function attentionAction(status: AttentionStatus, markable: boolean): AttentionAction | null {
  if (!markable) return null;
  if (status === "idle") return "unread";
  if (status === "done" || status === "blocked") return "read";
  return null;
}

export interface MenuPoint {
  top: number;
  left: number;
}
export interface MenuSize {
  width: number;
  height: number;
}
const MENU_MARGIN_PX = 8;

/** Where a fixed menu wanting `want` actually goes: pulled back inside the viewport, so a right-click
 *  near the bottom or right edge opens it upward / leftward instead of off-screen. */
export function fitMenu(want: MenuPoint, menu: MenuSize, viewport: MenuSize): MenuPoint {
  const fit = (start: number, extent: number, room: number) => Math.max(MENU_MARGIN_PX, Math.min(start, room - extent - MENU_MARGIN_PX));
  return { top: Math.round(fit(want.top, menu.height, viewport.height)), left: Math.round(fit(want.left, menu.width, viewport.width)) };
}
