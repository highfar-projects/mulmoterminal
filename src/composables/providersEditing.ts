import { isProviderProblem, type ProviderProblem } from "../../common/providerEntries";
import { postEntryChange, type EntryChange } from "./configEntryChange";
import { reloadLaunchOptions } from "./useLaunchOptions";

// Add or remove ONE backend (#2621), against the list on disk. What the Settings list and the launch
// form's picker show comes from /api/launch-options, which resolves each backend (is its key set?),
// so that is re-asked after a change rather than patched here.
export async function changeProviders(action: "add" | "remove", payload: Record<string, unknown>): Promise<EntryChange<ProviderProblem>> {
  const change = await postEntryChange(`/api/config/providers/${action}`, payload, isProviderProblem);
  if (change.ok) await reloadLaunchOptions();
  return change;
}
