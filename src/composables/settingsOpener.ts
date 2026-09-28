// Whether Settings is open, and which section it should show (#2450). Module-level because the
// command palette asks for a section from the toolbar, while the grid owns the modal.
import { ref } from "vue";
import type { SettingsTabId } from "../components/settings/settingsTabs";

export const settingsOpen = ref(false);
/** A section asked for and not yet shown. The modal takes it on mount, and on a later request. */
export const requestedSettingsTab = ref<SettingsTabId | null>(null);

export function openSettingsAt(tab: SettingsTabId): void {
  requestedSettingsTab.value = tab;
  settingsOpen.value = true;
}
