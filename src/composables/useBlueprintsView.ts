// Navigation seam for the full-screen blueprint overlay — same shape as useRoomsView. The open BUILD
// is the URL, so a build waiting for its owner's approval can be linked to and reloaded.
import { computed, shallowRef, type ComputedRef } from "vue";
import type { HearingAnswers } from "../../common/blueprint/hearing";
import { router } from "../router";
import { overlayOriginState, overlayReturnPath } from "./overlayOrigin";
import { RUN_ID_RE } from "../../common/blueprint/run";

export function blueprintsViewOpen(runId?: string): void {
  const to = runId && RUN_ID_RE.test(runId) ? { name: "blueprintRun", params: { run: runId } } : { name: "blueprints" };
  void router.push({ ...to, state: overlayOriginState() });
}

export function blueprintsViewClose(): void {
  void router.push(overlayReturnPath());
}

/** Moves INSIDE the overlay with `replace`, so closing returns to where it was opened from. */
export function blueprintsViewSelect(runId: string | null): void {
  const to = runId ? { name: "blueprintRun", params: { run: runId } } : { name: "blueprints" };
  void router.replace({ ...to, state: overlayOriginState() });
}

export function blueprintsViewMarket(): void {
  void router.replace({ name: "blueprintMarket", state: overlayOriginState() });
}

/** A new build that continues a finished one: the same base and folder, the next usecase, and the answers it fills in. */
export interface FollowUp {
  readonly base: string;
  readonly usecase: string;
  readonly answers: HearingAnswers;
  readonly projectDir: string;
  /** The finished build's usecase title, for the form to say what it continues. */
  readonly after: string;
}

// Handed from the run view to the new-build form it opens; taken once, so a later visit to the form starts empty.
const pendingFollowUp = shallowRef<FollowUp | null>(null);

export function blueprintsViewFollowUp(followUp: FollowUp): void {
  pendingFollowUp.value = followUp;
  blueprintsViewSelect(null);
}

export function takeFollowUp(): FollowUp | null {
  const followUp = pendingFollowUp.value;
  pendingFollowUp.value = null;
  return followUp;
}

const ROUTE_NAMES = new Set(["blueprints", "blueprintRun", "blueprintMarket"]);

export function useBlueprintsView(): { isOpen: ComputedRef<boolean>; runId: ComputedRef<string | null>; inMarket: ComputedRef<boolean>; close: () => void } {
  const route = computed(() => router.currentRoute.value);
  return {
    isOpen: computed(() => ROUTE_NAMES.has(String(route.value.name))),
    inMarket: computed(() => route.value.name === "blueprintMarket"),
    runId: computed(() => {
      const raw = route.value.params.run;
      return typeof raw === "string" && RUN_ID_RE.test(raw) ? raw : null;
    }),
    close: blueprintsViewClose,
  };
}
