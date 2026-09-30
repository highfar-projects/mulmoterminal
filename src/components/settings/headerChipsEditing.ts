import { CELL_CHIP_IDS, effectiveChips, type CellChipId, type ChipEntry } from "../../../common/headerChips";

// What the chip editor shows, kept out of the component so the rules can be tested alone.

/** Each chip with a key that follows the chip, not its place: the chip's own value, and for a chip
 *  listed twice, which of the equal ones it is. Moving a row keeps its key. */
export function chipRows(chips: readonly ChipEntry[]): { chip: ChipEntry; key: string }[] {
  const seen = new Map<string, number>();
  return chips.map((chip) => {
    const value = JSON.stringify(chip);
    const nth = seen.get(value) ?? 0;
    seen.set(value, nth + 1);
    return { chip, key: `${value}#${nth}` };
  });
}

/** The built-in chips that are not on the list yet — the ones the add menu can offer. */
export const addableBuiltins = (current: readonly ChipEntry[] | null): CellChipId[] => {
  const shown = effectiveChips(current);
  return CELL_CHIP_IDS.filter((id) => !shown.includes(id));
};
