<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ACCOUNT_AGENTS, type AccountAgent } from "../../../common/agentAccounts";
import { useAppConfig } from "../../composables/useAppConfig";
import { useEntryListEditor } from "../../composables/useEntryListEditor";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import SettingsListRow from "./SettingsListRow.vue";
import { SETTINGS_LIST } from "./sectionClasses";
import { buildAccount, type EntryProblem } from "../../../common/agentEntries";

// A second login for Claude Code or Codex, added and removed here (#2620). The login itself happens
// in the first cell started on it; this only names the directory it lives in.
const { t } = useI18n();
const { accounts, changeAccounts } = useAppConfig();

const label = ref("");
const agent = ref<AccountAgent>("claude");
const home = ref("");
const { saving, refused, serverProblem, apply, remove } = useEntryListEditor(changeAccounts);
const draft = computed(() => buildAccount(label.value, agent.value, home.value, accounts.value));
const localProblem = computed<EntryProblem | null>(() => ((!label.value.trim() && !home.value.trim()) || "entry" in draft.value ? null : draft.value.problem));
const homePlaceholder = computed(() => (agent.value === "codex" ? "~/.codex-work" : "~/.claude-work"));

async function add() {
  if (!("entry" in draft.value) || saving.value) return;
  if (!(await apply("add", { label: label.value, agent: agent.value, home: home.value }))) return;
  label.value = "";
  home.value = "";
}

function onAgent(e: Event) {
  const picked = ACCOUNT_AGENTS.find((candidate) => e.target instanceof HTMLSelectElement && candidate === e.target.value);
  if (picked) agent.value = picked;
}
// What the form says is wrong: the list here first, then what the server found in the list on disk.
const problem = computed<EntryProblem | null>(() => localProblem.value ?? serverProblem.value);
</script>

<template>
  <ul v-if="accounts.length" data-testid="settings-accounts" :class="SETTINGS_LIST">
    <SettingsListRow v-for="account in accounts" :key="account.id" :name="account.label" :disabled="saving" @remove="remove(account.id)">
      <span class="shrink-0 font-mono text-[12px] text-secondary">{{ account.label }}</span>
      <span class="shrink-0 text-[11px] text-dim">{{ account.agent }}</span>
      <span class="min-w-0 flex-auto truncate font-mono text-[11px] text-dim" :data-tip="account.home">{{ account.home }}</span>
    </SettingsListRow>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">{{ t("settings.models.noAccounts") }}</p>
  <div class="flex items-center gap-2">
    <SettingsField
      v-model="label"
      class="min-w-0 shrink grow basis-[25%]"
      data-testid="account-label"
      :placeholder="t('settingsControls.accounts.labelPlaceholder')"
      :aria-label="t('settingsControls.accounts.labelField')"
      spellcheck="false"
      @keydown.enter="add"
    />
    <select
      class="cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1.5 text-[12px] text-fg"
      data-testid="account-agent"
      :value="agent"
      :aria-label="t('settingsControls.accounts.agentField')"
      @change="onAgent"
    >
      <option v-for="option in ACCOUNT_AGENTS" :key="option" :value="option">{{ option === "claude" ? "Claude Code" : "Codex" }}</option>
    </select>
    <SettingsField
      v-model="home"
      class="min-w-0 flex-auto font-mono"
      data-testid="account-home"
      :placeholder="homePlaceholder"
      :aria-label="t('settingsControls.accounts.homeField')"
      spellcheck="false"
      @keydown.enter="add"
    />
    <SettingsButton data-testid="account-add" :disabled="!('entry' in draft) || saving" @click="add">{{ t("settings.common.add") }}</SettingsButton>
  </div>
  <p v-if="problem" class="mt-1 text-[11px] text-err-text" data-testid="account-problem">{{ t(`settingsControls.entryProblems.${problem}`) }}</p>
  <p v-if="refused" class="mt-1 text-[11px] text-err-text" data-testid="account-refused">{{ t("settingsControls.entryProblems.refused") }}</p>
  <p class="mb-3 mt-1 text-[11px] text-dim">{{ t("settingsControls.accounts.hint") }}</p>
</template>
