// The grid's side of the palette's terminal rows (#2446): its roster, and going to one of them.
import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { router } from "../router";
import { providePaletteTerminals, type PaletteTerminal } from "./commandPalette";
import { paletteTerminalOf, type TerminalRowSource } from "./paletteTerminalRow";

/** `jump` moves the grid to the terminal; picked from another screen, the grid is brought back too. */
export function usePaletteTerminals(rows: () => readonly TerminalRowSource[], home: Ref<string | null>, jump: (uid: number) => void): void {
  const list = (): PaletteTerminal[] => rows().flatMap((row) => paletteTerminalOf(row, home.value) ?? []);
  const goTo = (uid: number): void => {
    if (router.currentRoute.value.name !== "terminals") void router.push("/terminals");
    jump(uid);
  };
  let withdraw: (() => void) | null = null;
  onMounted(() => (withdraw = providePaletteTerminals({ list, goTo })));
  onBeforeUnmount(() => withdraw?.());
}
