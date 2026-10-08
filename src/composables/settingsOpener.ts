// Whether Settings is open, and which section it should show (#2450). Module-level because the
// command palette asks for a section from the toolbar, while the grid owns the modal.
import { ref } from "vue";
import type { SettingsTabId } from "../components/settings/settingsTabs";

export const settingsOpen = ref(false);
/** A section asked for and not yet shown. The modal takes it on mount, and on a later request. */
export const requestedSettingsTab = ref<SettingsTabId | null>(null);
/** A directory whose settings were asked for from its cell (#2729), not yet shown. Directory
 *  settings takes it, opens that directory's row and scrolls to it. */
export const requestedSettingsDir = ref<string | null>(null);

/** Close Settings and forget a section still waiting to be shown (a Voice request waits for the
 *  modal's probe), so the next plain open starts on the default. */
export function closeSettings(): void {
  settingsOpen.value = false;
  requestedSettingsTab.value = null;
  requestedSettingsDir.value = null;
}

export function openSettingsAt(tab: SettingsTabId): void {
  requestedSettingsTab.value = tab;
  settingsOpen.value = true;
}

/** Open Settings on one directory's settings, the way its cell's path menu asks for them. */
export function openDirSettings(dir: string): void {
  requestedSettingsDir.value = dir;
  openSettingsAt("dirSettings");
}
