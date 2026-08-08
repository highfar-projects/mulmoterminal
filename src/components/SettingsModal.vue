<script setup lang="ts">
// The Settings modal's shell: the dialog frame, its keyboard behavior, and the sidebar that decides
// which section is on screen.
//
// Each section owns its own state — its composable, or the one prop/emit pair it edits — so it
// is one file under ./settings, and what stays here is what belongs to the modal itself. The
// props/emits below are pure plumbing: they exist because the shells (and the specs) address
// this component, and each one is handed straight to the section that reads it.
//
// One pane at a time is `v-if`, not a hidden pane: coming here for one setting used not to be
// distinguishable from opening every section at once, which is a GET each.
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { MODAL_FOCUSABLE } from "../utils/focusTrap";
import { useModalKeyboard } from "../composables/useModalKeyboard";
import { fetchVoiceInputStatus } from "../composables/voiceModelStatus";
import SettingsButton from "./SettingsButton.vue";
import AppVersionLine from "./settings/AppVersionLine.vue";
import ThemeSection from "./settings/ThemeSection.vue";
import TerminalFontSizeSection from "./settings/TerminalFontSizeSection.vue";
import TerminalFontFamilySection from "./settings/TerminalFontFamilySection.vue";
import TerminalScrollSection from "./settings/TerminalScrollSection.vue";
import WaitingRowsSection from "./settings/WaitingRowsSection.vue";
import DirAppearanceSection from "./settings/DirAppearanceSection.vue";
import DirSettingsSection from "./settings/DirSettingsSection.vue";
import NotificationSoundsSection from "./settings/NotificationSoundsSection.vue";
import VoiceInputSection from "./settings/VoiceInputSection.vue";
import WebPushSection from "./settings/WebPushSection.vue";
import GoogleAccountSection from "./settings/GoogleAccountSection.vue";
import PrReposSection from "./settings/PrReposSection.vue";
import LaunchersSection from "./settings/LaunchersSection.vue";
import QuickCommandsSection from "./settings/QuickCommandsSection.vue";
import McpServersSection from "./settings/McpServersSection.vue";
import CostSection from "./settings/CostSection.vue";
import GitHubSection from "./settings/GitHubSection.vue";
import SessionSection from "./settings/SessionSection.vue";
import SurvivingSessionsSection from "./settings/SurvivingSessionsSection.vue";
import HeaderChromeSection from "./settings/HeaderChromeSection.vue";
import ModelsSection from "./settings/ModelsSection.vue";
import TerminalKeysSection from "./settings/TerminalKeysSection.vue";
import KeyboardShortcutsSection from "./settings/KeyboardShortcutsSection.vue";
import HelpSection from "./settings/HelpSection.vue";
import { SECTION_HEADING } from "./settings/sectionClasses";
import { DEFAULT_SETTINGS_TAB, SETTINGS_GROUPS, isSettingsTabId, settingsTabLabel, type SettingsTabId } from "./settings/settingsTabs";
import type { Launcher } from "./launchers";
import type { UserMcpServer } from "./userMcp";
import type { QuickCommand } from "../../common/quickCommands";
import type { PushKind } from "../../common/pushKinds";
import type { NotifyKind } from "../../common/notifyKinds";
import type { SoundMap } from "../composables/soundSettings";
import type { SoundEmits } from "./settings/soundEmits";
import type { BundledSkillName } from "../../common/bundledSkills";

defineProps<{
  soundFile?: string | null;
  soundKinds?: NotifyKind[];
  sounds?: SoundMap;
  pushEnabled?: boolean;
  pushKinds?: PushKind[];
  prRepos?: string[];
  launchers?: Launcher[];
  quickCommands?: QuickCommand[];
  userMcpServers?: UserMcpServer[];
  cwd?: string | null | undefined;
  sessionId?: string | null | undefined;
  // Directories to offer a config preview for: the recent-dir presets, plus the focused
  // session's own directory when it isn't one of them yet.
  dirPaths?: string[];
}>();

// The sound events come from NotificationSoundsSection's own contract — this modal only forwards
// them, so it must not spell them out a second time.
const emit = defineEmits<
  SoundEmits & {
    (e: "update-push-enabled", on: boolean): void;
    (e: "update-push-kinds", kinds: PushKind[]): void;
    (e: "update-repos", repos: string[]): void;
    (e: "update-launchers", launchers: Launcher[]): void;
    (e: "update-quick-commands", commands: QuickCommand[]): void;
    (e: "update-user-mcp", servers: UserMcpServer[]): void;
    // Hand a section over to the skill that owns it. Named by skill rather than by section
    // ("configure-appearance") so a new button costs nothing outside this file.
    (e: "launch-skill", skill: BundledSkillName): void;
    (e: "close"): void;
  }
>();

const modalEl = ref<HTMLElement>();
const activeTab = ref<SettingsTabId>(DEFAULT_SETTINGS_TAB);
const SETTINGS_PANE_ID = "settings-pane";

// Voice input is only worth a tab on a machine that can transcribe, and capability lives on the
// server. One cheap GET when the modal opens; a failed or absent probe leaves the tab out rather
// than offering a setting for a mic that will never appear. It can only go absent → present, so no
// tab can vanish from under the user.
const voiceCapable = ref(false);
onMounted(async () => {
  voiceCapable.value = (await fetchVoiceInputStatus())?.capable ?? false;
});

// A pane is created the first time its tab is opened, and hidden rather than destroyed after that.
// `v-if` alone throws away what a section is holding but has not saved — TerminalFontFamilySection
// keeps a typed stack in a local draft precisely so a failed POST doesn't lose it, and arrowing
// past the tab discarded it (Codex review on #1565). Closing the modal still resets everything:
// the shells `v-if` the modal itself, so nothing here outlives it.
const visitedTabs = reactive(new Set<SettingsTabId>());
watch(activeTab, (tab) => visitedTabs.add(tab), { immediate: true });

const visibleGroups = computed(() =>
  SETTINGS_GROUPS.map((group) => ({ ...group, tabs: group.tabs.filter((tab) => tab.id !== "voice" || voiceCapable.value) })).filter(
    (group) => group.tabs.length > 0,
  ),
);

const activeLabel = computed(() => settingsTabLabel(activeTab.value));

// Below `sm` the sidebar would leave a phone about 190px of pane — narrow enough that the sound
// rows lose their own labels off the left edge. The groups become <optgroup>s of a native picker
// there instead, which costs the pane nothing.
function onTabPick(e: Event) {
  if (e.target instanceof HTMLSelectElement && isSettingsTabId(e.target.value)) activeTab.value = e.target.value;
}

// ARIA tablist keyboard contract, for the reason a 24-entry sidebar needs it: without roving
// tabindex the list is 24 Tab stops standing between the dialog and the setting you opened it for
// — more keystrokes than the flat scroll this replaced. Only the selected tab is tabbable, and
// arrows move within the list, so the whole sidebar is one stop.
//
// Selection follows focus (the pattern's automatic activation, as ThemeSection's radiogroup does):
// arrowing therefore mounts each pane it lands on, GETs included. That is the cost of the cheaper
// option, and it is bounded by the sections the user actually arrows past.
const navEl = ref<HTMLElement>();
const visibleTabs = computed(() => visibleGroups.value.flatMap((group) => group.tabs));

function onTabKey(e: KeyboardEvent, id: SettingsTabId) {
  const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
  const backward = e.key === "ArrowUp" || e.key === "ArrowLeft";
  if (!forward && !backward) return;
  e.preventDefault();
  const tabs = visibleTabs.value;
  const index = tabs.findIndex((tab) => tab.id === id);
  const next = tabs[(index + (forward ? 1 : tabs.length - 1)) % tabs.length];
  if (!next) return;
  activeTab.value = next.id;
  void nextTick(() => navEl.value?.querySelector<HTMLElement>(`[data-testid="settings-tab-${next.id}"]`)?.focus());
}

// Escape closes; Tab is trapped within the dialog. The first stop is an `input` where there is
// one — the sections are mostly text fields, and landing on the Close button instead means
// tabbing past the whole dialog to reach the setting you opened it for.
useModalKeyboard({ modalEl, onClose: () => emit("close"), trapSelector: MODAL_FOCUSABLE, focusSelector: "input, button" });
</script>

<template>
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.55)]" @click.self="emit('close')">
    <div
      ref="modalEl"
      class="flex h-[85vh] w-[min(780px,94vw)] flex-col overflow-hidden rounded-[10px] border border-border bg-base font-sans text-fg"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div class="flex items-start justify-between border-b border-border px-4 py-3">
        <div class="min-w-0">
          <h2 class="m-0 text-[15px] font-semibold">Settings</h2>
          <AppVersionLine />
        </div>
        <button
          class="cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 text-[14px] text-muted hover:bg-[var(--err-hover-bg)] hover:text-err-text"
          title="Close"
          aria-label="Close settings"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>

      <div class="flex min-h-0 flex-1 flex-col sm:flex-row">
        <select
          class="m-3 mb-0 shrink-0 cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1.5 text-[12px] text-fg sm:hidden"
          :value="activeTab"
          aria-label="Settings section"
          @change="onTabPick"
        >
          <optgroup v-for="group in visibleGroups" :key="group.key" :label="group.label">
            <option v-for="tab in group.tabs" :key="tab.id" :value="tab.id">{{ tab.label }}</option>
          </optgroup>
        </select>

        <div
          ref="navEl"
          class="hidden w-40 shrink-0 overflow-y-auto border-r border-border bg-subtle py-2 sm:block"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Settings sections"
        >
          <div v-for="group in visibleGroups" :key="group.key" class="mb-2" role="presentation">
            <div class="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted" role="presentation">{{ group.label }}</div>
            <button
              v-for="tab in group.tabs"
              :id="`settings-tab-${tab.id}`"
              :key="tab.id"
              class="w-full cursor-pointer border-0 border-l-2 bg-transparent px-3 py-1.5 text-left text-[12px]"
              :class="activeTab === tab.id ? 'border-l-accent bg-elevated font-semibold text-fg' : 'border-l-transparent text-dim hover:bg-elevated'"
              role="tab"
              :aria-selected="activeTab === tab.id"
              :aria-controls="SETTINGS_PANE_ID"
              :tabindex="activeTab === tab.id ? 0 : -1"
              :data-testid="`settings-tab-${tab.id}`"
              @click="activeTab = tab.id"
              @keydown="onTabKey($event, tab.id)"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div
          :id="SETTINGS_PANE_ID"
          class="min-w-0 flex-1 overflow-y-auto px-4 pb-4"
          role="tabpanel"
          :aria-labelledby="`settings-tab-${activeTab}`"
          data-testid="settings-pane"
        >
          <h3 :class="SECTION_HEADING">{{ activeLabel }}</h3>

          <div v-if="visitedTabs.has('theme')" v-show="activeTab === 'theme'" data-testid="settings-pane-theme">
            <ThemeSection @launch-skill="emit('launch-skill', $event)" />
          </div>
          <div v-if="visitedTabs.has('font')" v-show="activeTab === 'font'" data-testid="settings-pane-font">
            <TerminalFontFamilySection />
          </div>
          <div v-if="visitedTabs.has('fontSize')" v-show="activeTab === 'fontSize'" data-testid="settings-pane-fontSize">
            <TerminalFontSizeSection />
          </div>
          <div v-if="visitedTabs.has('scroll')" v-show="activeTab === 'scroll'" data-testid="settings-pane-scroll">
            <TerminalScrollSection />
          </div>
          <div v-if="visitedTabs.has('waitingRows')" v-show="activeTab === 'waitingRows'" data-testid="settings-pane-waitingRows">
            <WaitingRowsSection />
          </div>
          <div v-if="visitedTabs.has('dirAppearance')" v-show="activeTab === 'dirAppearance'" data-testid="settings-pane-dirAppearance">
            <DirAppearanceSection @launch-skill="emit('launch-skill', $event)" />
          </div>
          <div v-if="visitedTabs.has('dirSettings')" v-show="activeTab === 'dirSettings'" data-testid="settings-pane-dirSettings">
            <DirSettingsSection :dir-paths="dirPaths" @launch-skill="emit('launch-skill', $event)" />
          </div>
          <div v-if="visitedTabs.has('launchers')" v-show="activeTab === 'launchers'" data-testid="settings-pane-launchers">
            <LaunchersSection :launchers="launchers" @update-launchers="emit('update-launchers', $event)" />
          </div>
          <div v-if="visitedTabs.has('headerChrome')" v-show="activeTab === 'headerChrome'" data-testid="settings-pane-headerChrome">
            <HeaderChromeSection @launch-skill="emit('launch-skill', $event)" />
          </div>
          <div v-if="visitedTabs.has('terminalKeys')" v-show="activeTab === 'terminalKeys'" data-testid="settings-pane-terminalKeys">
            <TerminalKeysSection />
          </div>
          <div v-if="visitedTabs.has('shortcuts')" v-show="activeTab === 'shortcuts'" data-testid="settings-pane-shortcuts">
            <KeyboardShortcutsSection @launch-skill="emit('launch-skill', $event)" />
          </div>
          <div v-if="visitedTabs.has('voice')" v-show="activeTab === 'voice'" data-testid="settings-pane-voice">
            <VoiceInputSection />
          </div>
          <div v-if="visitedTabs.has('models')" v-show="activeTab === 'models'" data-testid="settings-pane-models">
            <ModelsSection @launch-skill="emit('launch-skill', $event)" />
          </div>
          <div v-if="visitedTabs.has('mcp')" v-show="activeTab === 'mcp'" data-testid="settings-pane-mcp">
            <McpServersSection :user-mcp-servers="userMcpServers" @update-user-mcp="emit('update-user-mcp', $event)" />
          </div>
          <div v-if="visitedTabs.has('sounds')" v-show="activeTab === 'sounds'" data-testid="settings-pane-sounds">
            <NotificationSoundsSection
              :sound-file="soundFile"
              :sound-kinds="soundKinds"
              :sounds="sounds"
              @update-sound="emit('update-sound', $event)"
              @update-sound-kinds="emit('update-sound-kinds', $event)"
              @update-sounds="emit('update-sounds', $event)"
              @launch-skill="emit('launch-skill', $event)"
            />
          </div>
          <div v-if="visitedTabs.has('push')" v-show="activeTab === 'push'" data-testid="settings-pane-push">
            <WebPushSection
              :push-enabled="pushEnabled"
              :push-kinds="pushKinds"
              @update-push-enabled="emit('update-push-enabled', $event)"
              @update-push-kinds="emit('update-push-kinds', $event)"
            />
          </div>
          <div v-if="visitedTabs.has('quickCommands')" v-show="activeTab === 'quickCommands'" data-testid="settings-pane-quickCommands">
            <QuickCommandsSection :quick-commands="quickCommands" @update-quick-commands="emit('update-quick-commands', $event)" />
          </div>
          <div v-if="visitedTabs.has('github')" v-show="activeTab === 'github'" data-testid="settings-pane-github">
            <GitHubSection />
          </div>
          <div v-if="visitedTabs.has('prRepos')" v-show="activeTab === 'prRepos'" data-testid="settings-pane-prRepos">
            <PrReposSection :pr-repos="prRepos" @update-repos="emit('update-repos', $event)" />
          </div>
          <div v-if="visitedTabs.has('google')" v-show="activeTab === 'google'" data-testid="settings-pane-google">
            <GoogleAccountSection />
          </div>
          <div v-if="visitedTabs.has('sessions')" v-show="activeTab === 'sessions'" data-testid="settings-pane-sessions">
            <SessionSection />
          </div>
          <div v-if="visitedTabs.has('surviving')" v-show="activeTab === 'surviving'" data-testid="settings-pane-surviving">
            <SurvivingSessionsSection />
          </div>
          <div v-if="visitedTabs.has('cost')" v-show="activeTab === 'cost'" data-testid="settings-pane-cost">
            <CostSection :cwd="cwd" :session-id="sessionId" />
          </div>
          <div v-if="visitedTabs.has('help')" v-show="activeTab === 'help'" data-testid="settings-pane-help">
            <HelpSection />
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 border-t border-border px-4 py-3">
        <span class="flex-1" />
        <SettingsButton primary @click="emit('close')">Close</SettingsButton>
      </div>
    </div>
  </div>
</template>
