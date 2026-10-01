<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAppConfig } from "../../composables/useAppConfig";
import { useEntryListEditor } from "../../composables/useEntryListEditor";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import SettingsListRow from "./SettingsListRow.vue";
import { SETTINGS_LIST } from "./sectionClasses";
import { buildCustomAgent, type EntryProblem } from "../../../common/agentEntries";

// Your own command for starting Claude Code, added and removed here (#2620). The id is derived from
// the label and fixed once saved, so an entry is removed and added again rather than edited.
const { t } = useI18n();
const { customAgents, changeCustomAgents } = useAppConfig();

const label = ref("");
const command = ref("");
const { saving, refused, serverProblem, apply, remove } = useEntryListEditor(changeCustomAgents);
const draft = computed(() => buildCustomAgent(label.value, command.value, customAgents.value));
// Said only once something is typed: an empty form is not a mistake.
const localProblem = computed<EntryProblem | null>(() =>
  (!label.value.trim() && !command.value.trim()) || "entry" in draft.value ? null : draft.value.problem,
);

async function add() {
  if (!("entry" in draft.value) || saving.value) return;
  if (!(await apply("add", { label: label.value, command: command.value }))) return;
  label.value = "";
  command.value = "";
}
// What the form says is wrong: the list here first, then what the server found in the list on disk.
const problem = computed<EntryProblem | null>(() => localProblem.value ?? serverProblem.value);
</script>

<template>
  <ul v-if="customAgents.length" :class="SETTINGS_LIST" data-testid="settings-custom-agents">
    <SettingsListRow v-for="agent in customAgents" :key="agent.id" :name="agent.label" :disabled="saving" @remove="remove(agent.id)">
      <span class="shrink-0 font-mono text-[12px] text-secondary">{{ agent.label }}</span>
      <code class="min-w-0 flex-auto truncate font-mono text-[11px] text-dim" :data-tip="agent.command">{{ agent.command }}</code>
    </SettingsListRow>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">{{ t("settings.models.noCustomAgents") }}</p>
  <div class="flex items-center gap-2">
    <SettingsField
      v-model="label"
      class="min-w-0 shrink grow basis-[30%]"
      data-testid="custom-agent-label"
      :placeholder="t('settingsControls.customAgents.labelPlaceholder')"
      :aria-label="t('settingsControls.customAgents.labelField')"
      spellcheck="false"
      @keydown.enter="add"
    />
    <SettingsField
      v-model="command"
      class="min-w-0 flex-auto font-mono"
      data-testid="custom-agent-command"
      :placeholder="t('settingsControls.customAgents.commandPlaceholder')"
      :aria-label="t('settingsControls.customAgents.commandField')"
      spellcheck="false"
      @keydown.enter="add"
    />
    <SettingsButton data-testid="custom-agent-add" :disabled="!('entry' in draft) || saving" @click="add">{{ t("settings.common.add") }}</SettingsButton>
  </div>
  <p v-if="problem" class="mt-1 text-[11px] text-err-text" data-testid="custom-agent-problem">{{ t(`settingsControls.entryProblems.${problem}`) }}</p>
  <p v-if="refused" class="mt-1 text-[11px] text-err-text" data-testid="custom-agent-refused">{{ t("settingsControls.entryProblems.refused") }}</p>
  <p class="mb-3 mt-1 text-[11px] text-dim">{{ t("settingsControls.customAgents.hint") }}</p>
</template>
