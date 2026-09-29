// Each terminal's header buttons and palette commands (#2465), for the command palette to list and
// run. A terminal registers what it resolved and how it runs one, so a pick from the palette takes
// exactly the path a click on the header takes — a shell command included.
import { onUnmounted, shallowReactive } from "vue";
import type { HeaderButton, HeaderEntry } from "./useHeaderButtons";

export interface PaletteHeaderEntries {
  buttons: () => readonly HeaderEntry[];
  commands: () => readonly HeaderEntry[];
  run: (button: HeaderButton) => void;
}

const bySlot = shallowReactive(new Map<string, PaletteHeaderEntries>());

export function providePaletteHeaderEntries(slotKey: string, entries: PaletteHeaderEntries): () => void {
  bySlot.set(slotKey, entries);
  return () => {
    if (bySlot.get(slotKey) === entries) bySlot.delete(slotKey);
  };
}

/** Register for the life of the calling component. */
export function usePaletteHeaderEntries(slotKey: string, entries: PaletteHeaderEntries): void {
  onUnmounted(providePaletteHeaderEntries(slotKey, entries));
}

export const paletteHeaderEntriesFor = (slotKey: string): PaletteHeaderEntries | null => bySlot.get(slotKey) ?? null;
