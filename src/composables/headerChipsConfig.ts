import { ref } from "vue";
import { isChipEntry, isChipProblem, type ChipEntry, type ChipProblem } from "../../common/headerChips";
import { isUnknownArray } from "../../common/isUnknownArray";
import { postEntryChange, type EntryChange } from "./configEntryChange";
import { setHeaderChipCount } from "./headerConfigSummary";
import { headerConfigRevision } from "./headerConfigRevision";

// The global header chips as Settings edits them (#2622). `null` is "unconfigured": the cells show
// their default set, and the editor lists that set as what a first change starts from.
export const globalHeaderChips = ref<ChipEntry[] | null>(null);

export function setGlobalHeaderChips(value: unknown): void {
  globalHeaderChips.value = isUnknownArray(value) ? value.filter(isChipEntry) : null;
}

export type ChipAction = "add" | "remove" | "move" | "reset";

// A refusal for a list that changed since it loaded carries the list as it now is, so the editor
// shows that rather than acting on the old one again.
export async function changeHeaderChips(action: ChipAction, payload: Record<string, unknown>): Promise<EntryChange<ChipProblem>> {
  const change = await postEntryChange(`/api/config/chips/${action}`, payload, isChipProblem);
  const answered = change.ok || change.problem === "stale" ? change.body : null;
  if (answered !== null && "chips" in answered) {
    setGlobalHeaderChips(answered.chips);
    setHeaderChipCount(answered.chips);
  }
  if (change.ok) headerConfigRevision.value += 1;
  return change;
}
