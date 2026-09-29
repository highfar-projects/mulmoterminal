// Moving where the grid's keyboard is: to a neighbour (`focus-next` / `focus-prev`, #2106), or to a
// named terminal (the command palette, #2446). The page and the cursor move together: the transform
// brings the target's page on screen, and the focus call is what SHOWS where the keyboard now is
// (the focused cell lifts) as well as where the next keystroke goes.
import { nextTick, type Ref } from "vue";
import { jumpTo, moveFocus, moveFocusUid, zoomedUid, type GridState } from "../components/gridTabs";
import * as conn from "./useTerminalConnections";

/** `order` is the on-screen order as uids — the full list, not the page (GridView's `orderUids`). */
export function useGridJumps(state: Ref<GridState>, focusedCellUid: Ref<number | null>, order: () => readonly number[]) {
  const focusSoon = (uid: number | null): void => {
    if (uid !== null) void nextTick(() => conn.focus(`cell-${uid}`));
  };
  const moveGridFocus = (dir: -1 | 1): void => {
    const target = moveFocusUid(state.value, order(), focusedCellUid.value, dir);
    state.value = moveFocus(state.value, order(), focusedCellUid.value, dir);
    focusSoon(target);
  };
  const jumpToTerminal = (uid: number): void => {
    if (!state.value.cells.some((cell) => cell.uid === uid)) return;
    state.value = jumpTo(state.value, uid, order());
    focusSoon(uid);
  };
  // The terminal a command acts on (#2465): the enlarged one, else the one holding the cursor.
  const currentUid = (): number | null => zoomedUid(state.value) ?? focusedCellUid.value;
  return { focusSoon, moveGridFocus, jumpToTerminal, currentUid };
}
