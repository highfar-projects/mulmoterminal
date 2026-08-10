// Inline CSS custom properties for a cell header tinted by <cwd>/.mulmoterminal.json
// (`headerColor` = background, `headerTextColor` = text). Emitted as variables — not a
// plain background/color — so the header's status tint (working/blocked) can still
// override the background while idle keeps the custom color, and the dir/prompt text
// pick up --cell-header-fg. A missing / non-hex value is dropped (the theme default
// shows through the var fallback). Shared by the grid cell and the single-view header.
import { isHexColor as isHex } from "./hexColor";
import { headerTextColorFor } from "../../common/chromeFromColor";

/**
 * @param dirBackgroundShows whether the directory's own `headerColor` is what is painted RIGHT NOW.
 * It decides whether a text colour may be DERIVED for a directory that declared none: a derived ink
 * is only readable against the background it was derived from, and a cell that is working / done /
 * blocked paints its own header background instead (cellStatusClasses.ts). Deriving there would put
 * white text — right for a dark `headerColor` — on the pale status wash a light theme mixes (#1591).
 * A header that always shows the directory's colour (the roster bar, a filmstrip thumbnail, the
 * terminal's own header row) passes true.
 */
export function headerStyleFor(background: string | null | undefined, text: string | null | undefined, dirBackgroundShows: boolean): Record<string, string> {
  const style: Record<string, string> = {};
  if (isHex(background)) style["--cell-header-bg"] = background;
  const ink = headerInk(background, text, dirBackgroundShows);
  if (ink) style["--cell-header-fg"] = ink;
  return style;
}

// A declared colour always wins; deriving only ever answers for the directory that declared none.
function headerInk(background: string | null | undefined, text: string | null | undefined, dirBackgroundShows: boolean): string | null {
  if (isHex(text)) return text;
  if (!dirBackgroundShows || !isHex(background)) return null;
  return headerTextColorFor(background);
}

// Inline CSS custom properties for the cell frame + accents, set on the cell root so
// descendants inherit them: body background, border, the idle status dot, and the
// header's icon buttons. Like the header vars, the status frame/dot still override
// their targets while working/blocked so activity feedback is preserved.
export function cellStyleFor(
  background: string | null | undefined,
  border: string | null | undefined,
  dot: string | null | undefined,
  button: string | null | undefined,
): Record<string, string> {
  const style: Record<string, string> = {};
  if (isHex(background)) style["--cell-bg"] = background;
  if (isHex(border)) style["--cell-border"] = border;
  if (isHex(dot)) style["--cell-dot"] = dot;
  if (isHex(button)) style["--cell-btn"] = button;
  return style;
}

// The Terminal component's own header row (the grid cell's row 2 and the single view's
// header) reuses the same header colors + button color, via the same CSS vars, so both
// header rows match. Emitted on that header element.
export function terminalHeaderStyleFor(
  background: string | null | undefined,
  text: string | null | undefined,
  button: string | null | undefined,
): Record<string, string> {
  // No status replaces THIS row's background — it is the directory's colour whatever the session is
  // doing — so a derived text colour is always safe here.
  const style = headerStyleFor(background, text, true);
  if (isHex(button)) style["--cell-btn"] = button;
  return style;
}
