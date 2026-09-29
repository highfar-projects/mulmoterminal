// The grid's side of the palette's terminal rows (#2446): its roster, and going to one of them.
import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { router } from "../router";
import { providePaletteTerminals, type PaletteTerminal } from "./commandPalette";
import { paletteTerminalOf, type TerminalRowSource } from "./paletteTerminalRow";
import { paletteLaunchDirs, type PaletteLaunchDir } from "./paletteLaunchDirs";
import type { CwdPreset } from "../components/presets";

interface GridJumps {
  /** Moves the grid to the terminal; picked from another screen, the grid is brought back too. */
  jumpToTerminal: (uid: number) => void;
  currentUid: () => number | null;
}

interface LaunchSources {
  presets: Ref<CwdPreset[]>;
  defaultCwd: Ref<string | null>;
  full: () => boolean;
}

export function usePaletteTerminals(rows: () => readonly TerminalRowSource[], home: Ref<string | null>, jumps: GridJumps, dirs: LaunchSources): void {
  const list = (): PaletteTerminal[] => rows().flatMap((row) => paletteTerminalOf(row, home.value) ?? []);
  const goTo = (uid: number): void => {
    // A row picked after its cell closed: stay where you are rather than switching screens for nothing.
    if (!list().some((terminal) => terminal.uid === uid)) return;
    if (router.currentRoute.value.name !== "terminals") void router.push("/terminals");
    jumps.jumpToTerminal(uid);
  };
  let withdraw: (() => void) | null = null;
  const launchDirs = (): PaletteLaunchDir[] => paletteLaunchDirs(dirs.presets.value, dirs.defaultCwd.value, home.value);
  onMounted(() => (withdraw = providePaletteTerminals({ list, goTo, current: jumps.currentUid, launchDirs, full: dirs.full })));
  onBeforeUnmount(() => withdraw?.());
}
