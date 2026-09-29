import { isHexColor } from "../../../common/hexColor";
import type { HeaderStatusColor, HeaderStatusColors, HeaderStatusKey } from "../../../common/headerStatusColors";

// What one edit in Settings does to the global `headerStatusColors`. A status with neither colour
// set is REMOVED rather than kept as `{ background: null, text: null }`: an absent status is how the
// file says "the theme decides", and it is what a reader of the config expects to find.
function withEntry(colors: HeaderStatusColors, key: HeaderStatusKey, entry: HeaderStatusColor): HeaderStatusColors {
  const rest: HeaderStatusColors = Object.fromEntries(Object.entries(colors).filter(([status]) => status !== key));
  return entry.background === null && entry.text === null ? rest : { ...rest, [key]: entry };
}

const current = (colors: HeaderStatusColors, key: HeaderStatusKey): HeaderStatusColor => colors[key] ?? { background: null, text: null };

/** `null` hands the background back to the theme. */
export const withStatusBackground = (colors: HeaderStatusColors, key: HeaderStatusKey, background: string | null): HeaderStatusColors =>
  withEntry(colors, key, { ...current(colors, key), background: isHexColor(background) ? background : null });

/** `null` derives a readable ink from the background again. */
export const withStatusText = (colors: HeaderStatusColors, key: HeaderStatusKey, text: string | null): HeaderStatusColors =>
  withEntry(colors, key, { ...current(colors, key), text: isHexColor(text) ? text : null });

export const withoutStatus = (colors: HeaderStatusColors, key: HeaderStatusKey): HeaderStatusColors => withEntry(colors, key, { background: null, text: null });

const toHexByte = (channel: string): string | null => {
  const value = Number(channel);
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value.toString(16).padStart(2, "0") : null;
};

// The channel arguments of `rgb(…)` / `rgba(…)`, in either syntax a browser may compute: the comma
// form `rgb(1, 2, 3)` / `rgba(1, 2, 3, 0.5)`, or the space form `rgb(1 2 3)` / `rgb(1 2 3 / 0.5)`.
function rgbArguments(css: string): string[] | null {
  const open = css.indexOf("(");
  if (open === -1 || !css.endsWith(")")) return null;
  const name = css.slice(0, open);
  if (name !== "rgb" && name !== "rgba") return null;
  const [channels = "", alpha] = css.slice(open + 1, -1).split("/");
  const args = channels.includes(",")
    ? channels.split(",")
    : channels
        .trim()
        .split(" ")
        .filter((arg) => arg !== "");
  const trimmed = args.map((arg) => arg.trim());
  if (alpha !== undefined) return trimmed.length === 3 && !channels.includes(",") ? trimmed : null;
  if (trimmed.length === 3) return trimmed;
  return trimmed.length === 4 && channels.includes(",") ? trimmed.slice(0, 3) : null;
}

/** A computed CSS colour as `#rrggbb`, to start a colour picker on what the theme paints now.
 *  Only `rgb()` / `rgba()` with integer channels and a hex are read; anything else (a `color()`
 *  from `color-mix`, a keyword) is null and the caller picks its own starting colour. */
export function cssColorToHex(css: string): string | null {
  const trimmed = css.trim();
  if (isHexColor(trimmed)) return trimmed.toLowerCase();
  const bytes = rgbArguments(trimmed)?.map(toHexByte) ?? null;
  return bytes?.every((byte): byte is string => byte !== null) ? `#${bytes.join("")}` : null;
}
