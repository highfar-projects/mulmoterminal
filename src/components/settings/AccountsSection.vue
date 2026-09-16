<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, ref } from "vue";
import { useSavedListMirror } from "../../composables/useSavedListMirror";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import { canAddAccount } from "../settingsValidators";
import type { Account } from "../../../common/accounts";
import SettingsListRow from "./SettingsListRow.vue";
import { SETTINGS_LIST } from "./sectionClasses";

const props = defineProps<{ accounts?: Account[] | undefined }>();
const emit = defineEmits<{ (e: "update-accounts", accounts: Account[]): void }>();

const { t } = useI18n();

// Claude Code logins the launch form's ACCOUNT select offers (id + label + config dir + an
// optional env var naming a `claude setup-token` OAuth token).
const { items: accountList, replace } = useSavedListMirror<Account>(
  () => props.accounts,
  (next) => emit("update-accounts", next),
);

const newId = ref("");
const newLabel = ref("");
const newConfigDir = ref("");
const newTokenEnvVar = ref("");
const newAccountValid = computed(() => canAddAccount(newId.value, newLabel.value, newConfigDir.value, accountList.value));
function addAccount() {
  if (!newAccountValid.value) return;
  const entry: Account = { id: newId.value.trim(), label: newLabel.value.trim(), configDir: newConfigDir.value.trim() };
  const tokenEnvVar = newTokenEnvVar.value.trim();
  replace([...accountList.value, tokenEnvVar ? { ...entry, oauthTokenEnvVar: tokenEnvVar } : entry]);
  newId.value = "";
  newLabel.value = "";
  newConfigDir.value = "";
  newTokenEnvVar.value = "";
}
function removeAccount(id: string) {
  replace(accountList.value.filter((a) => a.id !== id));
}
</script>

<template>
  <i18n-t keypath="settings.accounts.intro" tag="p" class="mb-3 mt-1.5 text-[12px] text-dim">
    <template #configDirKey><code>CLAUDE_CONFIG_DIR</code></template>
    <template #tokenKey><code>oauthTokenEnvVar</code></template>
    <template #accountKey><code>account</code></template>
    <template #dirFile><code>.mulmoterminal.json</code></template>
  </i18n-t>
  <ul v-if="accountList.length" :class="SETTINGS_LIST">
    <SettingsListRow v-for="a in accountList" :key="a.id" :name="a.label" @remove="removeAccount(a.id)">
      <span class="flex-auto font-mono text-[12px] text-secondary">{{ a.label }}</span>
      <code class="min-w-0 flex-auto truncate font-mono text-[11px] text-dim" :title="a.configDir">{{ a.configDir }}</code>
      <span v-if="a.oauthTokenEnvVar" class="shrink-0 font-mono text-[11px] text-dim">{{ a.oauthTokenEnvVar }}</span>
    </SettingsListRow>
  </ul>
  <div class="flex flex-wrap items-center gap-2">
    <SettingsField
      v-model="newId"
      class="min-w-0 shrink grow basis-[18%]"
      :placeholder="t('settings.accounts.idPlaceholder')"
      :aria-label="t('settings.accounts.idField')"
      spellcheck="false"
      @keydown.enter="addAccount"
    />
    <SettingsField
      v-model="newLabel"
      class="min-w-0 shrink grow basis-[18%]"
      :placeholder="t('settings.accounts.labelPlaceholder')"
      :aria-label="t('settings.accounts.labelField')"
      spellcheck="false"
      @keydown.enter="addAccount"
    />
    <SettingsField
      v-model="newConfigDir"
      class="min-w-0 flex-auto font-mono"
      :placeholder="t('settings.accounts.configDirPlaceholder')"
      :aria-label="t('settings.accounts.configDirField')"
      spellcheck="false"
      @keydown.enter="addAccount"
    />
    <SettingsField
      v-model="newTokenEnvVar"
      class="min-w-0 shrink grow basis-[22%] font-mono"
      :placeholder="t('settings.accounts.tokenEnvVarPlaceholder')"
      :aria-label="t('settings.accounts.tokenEnvVarField')"
      spellcheck="false"
      @keydown.enter="addAccount"
    />
    <SettingsButton :disabled="!newAccountValid" @click="addAccount">{{ t("settings.common.add") }}</SettingsButton>
  </div>
</template>
