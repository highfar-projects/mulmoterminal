// The grid's side of the palette's terminal rows (#2446): its roster, and going to one of them.
import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { router } from "../router";
import { providePaletteTerminals, type PaletteTerminal } from "./commandPalette";
import { paletteTerminalOf, type TerminalRowSource } from "./paletteTerminalRow";
import { paletteLaunchDirs, type PaletteLaunchDir } from "./paletteLaunchDirs";
import type { CwdPreset } from "../components/presets";
import type { Cell } from "../components/gridTabs";
import { promptSourceOf } from "./palettePrompts";
import { homeRelative } from "../components/cwdDisplay";

interface GridJumps {
  /** Moves the grid to the terminal; picked from another screen, the grid is brought back too. */
  jumpToTerminal: (uid: number) => void;
  currentUid: () => number | null;
  currentCell: () => Cell | null;
}

interface LaunchSources {
  presets: Ref<CwdPreset[]>;
  defaultCwd: Ref<string | null>;
  full: () => boolean;
  openSessionIds: Readonly<Ref<readonly string[]>>;
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
  const startDir = (): PaletteLaunchDir | null => {
    const uid = jumps.currentUid();
    const cwd = rows().find((row) => row.uid === uid)?.cwd ?? dirs.defaultCwd.value;
    return cwd ? { path: cwd, label: homeRelative(cwd, home.value) } : null;
  };
  onMounted(
    () =>
      (withdraw = providePaletteTerminals({
        list,
        goTo,
        current: jumps.currentUid,
        promptSource: () => promptSourceOf(jumps.currentCell()),
        launchDirs,
        startDir,
        full: dirs.full,
        openSessionIds: () => dirs.openSessionIds.value,
      })),
  );
  onBeforeUnmount(() => withdraw?.());
}
