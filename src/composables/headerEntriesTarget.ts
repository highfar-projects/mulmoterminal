// Where the header button and chip editors read their list from and send a change to (#2727): the
// global config by default, or one directory's config when a directory's Settings form provides one.
// Injected rather than passed as a prop, because a target is a pair of a list and a way to change it.
import { inject, type ComputedRef, type InjectionKey, type Ref } from "vue";
import type { ButtonProblem } from "../../common/headerButtonEntries";
import type { ChipEntry, ChipProblem } from "../../common/headerChips";
import type { EntryChange } from "./configEntryChange";
import { changeHeaderButtons, globalHeaderButtons, type ButtonAction, type ButtonRow } from "./headerButtonsConfig";
import { changeHeaderChips, globalHeaderChips, type ChipAction } from "./headerChipsConfig";

/** `global` shows an unconfigured list as the built-in set and resets back to it; `dir` shows it as
 *  "nothing here, the global list applies" and its reset takes the key out of the directory. */
export type HeaderEntriesScope = "global" | "dir";

export interface ButtonsTarget {
  scope: HeaderEntriesScope;
  /** Which list: the header's buttons, or the command palette's commands (a directory only). */
  list: "buttons" | "commands";
  rows: Readonly<Ref<ButtonRow[] | null>> | ComputedRef<ButtonRow[] | null>;
  change: (action: ButtonAction, payload: Record<string, unknown>) => Promise<EntryChange<ButtonProblem>>;
}

export interface ChipsTarget {
  scope: HeaderEntriesScope;
  chips: Readonly<Ref<ChipEntry[] | null>> | ComputedRef<ChipEntry[] | null>;
  change: (action: ChipAction, payload: Record<string, unknown>) => Promise<EntryChange<ChipProblem>>;
}

export const BUTTONS_TARGET: InjectionKey<ButtonsTarget> = Symbol("buttons-target");
export const CHIPS_TARGET: InjectionKey<ChipsTarget> = Symbol("chips-target");

const GLOBAL_BUTTONS: ButtonsTarget = { scope: "global", list: "buttons", rows: globalHeaderButtons, change: changeHeaderButtons };
const GLOBAL_CHIPS: ChipsTarget = { scope: "global", chips: globalHeaderChips, change: changeHeaderChips };

export const useButtonsTarget = (): ButtonsTarget => inject(BUTTONS_TARGET, GLOBAL_BUTTONS);
export const useChipsTarget = (): ChipsTarget => inject(CHIPS_TARGET, GLOBAL_CHIPS);
