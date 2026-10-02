// Navigation seam for the full-screen Processes overlay (#2219) — same shape as useSkillsView.
import { computed, type ComputedRef } from "vue";
import { router } from "../router";
import { overlayOriginState, overlayReturnPath } from "./overlayOrigin";

export function processesViewOpen(): void {
  void router.push({ name: "processes", state: overlayOriginState() });
}

export function processesViewClose(): void {
  void router.push(overlayReturnPath());
}

export function useProcessesView(): { isOpen: ComputedRef<boolean>; close: () => void } {
  return {
    isOpen: computed(() => router.currentRoute.value.name === "processes"),
    close: processesViewClose,
  };
}
