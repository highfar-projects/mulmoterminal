// Navigation seam for the experimental GitHub board (#3172), the sibling of useGithubView: the open
// view is the URL, /github/board.
import { computed, ref, type ComputedRef } from "vue";
import { router } from "../router";
import { overlayOriginState, overlayReturnPath } from "./overlayOrigin";

const isBoardRoute = (): boolean => router.currentRoute.value.name === "githubBoard";

/** Open the board. From the list it keeps the list's origin, so closing goes back past both. */
export function githubBoardGoto(): void {
  void router.push({ path: "/github/board", state: overlayOriginState() });
}

export function useGithubBoardView(): { isOpen: ComputedRef<boolean>; close: () => void } {
  return {
    isOpen: computed(isBoardRoute),
    close: () => void router.push(overlayReturnPath()),
  };
}

/** The card whose detail panel is open (#3177), by its repo and its key within that repo. Module
 *  state so the overlay's Escape can close the panel before it closes the board. */
export interface BoardSelection {
  repo: string;
  key: string;
}

export const boardSelection = ref<BoardSelection | null>(null);
