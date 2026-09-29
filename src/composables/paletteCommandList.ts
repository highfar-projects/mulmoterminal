// The header buttons and palette commands of one terminal, as command-palette rows list them
// (#2465). Pure: a folder's items are listed one by one under "Folder › Item".
import { isHeaderFolder, type HeaderButton, type HeaderEntry } from "./useHeaderButtons";

export interface PaletteCommand {
  id: string;
  label: string;
  icon: string;
  /** Where it comes from: the header, or the palette-only `commands`. */
  detail: string;
}

const DEFAULT_ICON = "bolt";
const FOLDER_SEPARATOR = " › ";

interface Placed {
  button: HeaderButton;
  /** The folder it sits in, or null at the top level. */
  folder: string | null;
}

const flatten = (entries: readonly HeaderEntry[]): Placed[] =>
  entries.flatMap((entry): Placed[] =>
    isHeaderFolder(entry) ? entry.items.map((button) => ({ button, folder: entry.label })) : [{ button: entry, folder: null }],
  );

const toCommand = ({ button, folder }: Placed, detail: string): PaletteCommand => ({
  id: button.id,
  label: folder === null ? button.label : `${folder}${FOLDER_SEPARATOR}${button.label}`,
  icon: button.icon ?? DEFAULT_ICON,
  detail,
});

export function paletteCommandList(
  buttons: readonly HeaderEntry[],
  commands: readonly HeaderEntry[],
  text: { fromHeader: string; fromCommands: string },
): PaletteCommand[] {
  return [...flatten(commands).map((entry) => toCommand(entry, text.fromCommands)), ...flatten(buttons).map((entry) => toCommand(entry, text.fromHeader))];
}

/** The button a row names, among a terminal's buttons and commands. */
export const findHeaderButton = (entries: readonly HeaderEntry[], id: string): HeaderButton | null =>
  flatten(entries).find(({ button }) => button.id === id)?.button ?? null;
