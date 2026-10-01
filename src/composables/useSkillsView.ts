// Navigation seam for the full-screen Skills overlay (#2815) — same shape as useRoomsView.
import { computed, type ComputedRef } from "vue";
import { router } from "../router";
import { overlayOriginState, overlayReturnPath } from "./overlayOrigin";

export function skillsViewOpen(): void {
  void router.push({ name: "skills", state: overlayOriginState() });
}

export function skillsViewClose(): void {
  void router.push(overlayReturnPath());
}

export function useSkillsView(): { isOpen: ComputedRef<boolean>; close: () => void } {
  return {
    isOpen: computed(() => router.currentRoute.value.name === "skills"),
    close: skillsViewClose,
  };
}
