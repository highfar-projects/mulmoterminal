// Navigation seam for the full-screen token usage overlay (#2919) — same shape as useProcessesView.
import { computed, type ComputedRef } from "vue";
import { router } from "../router";
import { overlayOriginState, overlayReturnPath } from "./overlayOrigin";

export function usageViewOpen(): void {
  void router.push({ name: "usage", state: overlayOriginState() });
}

export function usageViewClose(): void {
  void router.push(overlayReturnPath());
}

export function useUsageView(): { isOpen: ComputedRef<boolean>; close: () => void } {
  return {
    isOpen: computed(() => router.currentRoute.value.name === "usage"),
    close: usageViewClose,
  };
}
