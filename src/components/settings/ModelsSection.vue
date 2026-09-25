<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, ref } from "vue";
import { useAppConfig } from "../../composables/useAppConfig";
import { useLaunchOptions } from "../../composables/useLaunchOptions";
import { useSavedListMirror } from "../../composables/useSavedListMirror";
import { isOfferable, notOfferedReason } from "../launchOffer";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import { SELECT_CONTROL } from "../selectClasses";
import { canAddAccount } from "../settingsValidators";
import { ACCOUNT_AGENTS, type AccountAgent, type AgentAccount } from "../../../common/agentAccounts";
import SettingsListRow from "./SettingsListRow.vue";
import { SETTINGS_LIST } from "./sectionClasses";

const { t } = useI18n();
import type { BundledSkillName } from "../../../common/bundledSkills";

// Read-only, like the shortcuts list: a provider is a name, a base URL and the env var its key is
// read from, and an editor for that is a form with a "your key is in the wrong variable" failure
// mode. What this section owes the user is the answer to "what can a session run on right now",
// which is two lists.
//
// Providers come from /api/launch-options rather than the config, because that route RESOLVES
// them — it reports `ready`, which the raw config cannot. Custom agents come from the config,
// because there is nothing to resolve: the command is the user's own and is run as written.
const { launchOptions } = useLaunchOptions();
const { customAgents, accounts, saveAccounts } = useAppConfig();

defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void }>();

// Accounts (#2215) are the one entry in this section with an add form: unlike a provider or a
// custom agent, an account is not resolved and not run-as-written — it is just a login's config
// directory, and a form for that is no riskier than the launcher/MCP-server forms already here.
const { items: accountList, replace } = useSavedListMirror<AgentAccount>(
  () => accounts.value,
  (next) => void saveAccounts(next),
);

const newAccountId = ref("");
const newAccountLabel = ref("");
const newAccountAgent = ref<AccountAgent | "">("");
const newAccountHome = ref("");
const newAccountTokenEnvVar = ref("");
const newAccountValid = computed(() =>
  canAddAccount(newAccountId.value, newAccountLabel.value, newAccountAgent.value, newAccountHome.value, accountList.value),
);
function addAccount() {
  if (!newAccountValid.value || newAccountAgent.value === "") return;
  const entry: AgentAccount = {
    id: newAccountId.value.trim(),
    label: newAccountLabel.value.trim(),
    agent: newAccountAgent.value,
    home: newAccountHome.value.trim(),
  };
  const tokenEnvVar = newAccountTokenEnvVar.value.trim();
  replace([...accountList.value, tokenEnvVar ? { ...entry, oauthTokenEnvVar: tokenEnvVar } : entry]);
  newAccountId.value = "";
  newAccountLabel.value = "";
  newAccountAgent.value = "";
  newAccountHome.value = "";
  newAccountTokenEnvVar.value = "";
}
function removeAccount(id: string) {
  replace(accountList.value.filter((a) => a.id !== id));
}
</script>

<template>
  <i18n-t keypath="settings.models.intro" tag="p" class="mb-2 mt-1.5 text-[12px] text-dim">
    <template #providersKey><code>providers</code></template>
    <template #configFile><code>~/.mulmoterminal/config.json</code></template>
    <template #providerKey><code>provider</code></template>
    <template #modelKey><code>model</code></template>
    <template #dirFile><code>.mulmoterminal.json</code></template>
  </i18n-t>
  <ul v-if="launchOptions.providers.length" :class="SETTINGS_LIST">
    <li v-for="p in launchOptions.providers" :key="p.id" class="flex items-baseline gap-2 rounded-md bg-elevated px-2 py-1.5">
      <span class="font-mono text-[12px] text-secondary">{{ p.label }}</span>
      <span class="text-[11px] text-dim">
        {{ t("settings.models.modelCount", { count: p.models.length }, p.models.length) }} · {{ t("settings.models.keyIn", { env: p.tokenEnv }) }}
      </span>
      <span class="flex-auto" />
      <span v-if="!p.ready" class="text-[11px] text-err-text" :title="p.reason">{{ t("settings.models.notReady") }}</span>
      <!-- Reachable, and still not a choice: a session cannot be started on a provider without a
           model, so the launch picker leaves it out. Said here because "ready · 0 models" reads
           like it works (#1432). -->
      <span v-else-if="!isOfferable(p)" class="text-[11px] text-err-text" :title="notOfferedReason(p) ?? ''">
        {{ t("settings.models.notInPicker") }}
      </span>
      <span v-else class="text-[11px] text-dim">{{ t("settings.models.ready") }}</span>
    </li>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">{{ t("settings.models.noProviders") }}</p>

  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">{{ t("settings.models.customTitle") }}</strong> (<code>customAgents</code>) {{ t("settings.models.customIntro") }}
  </p>
  <ul v-if="customAgents.length" :class="SETTINGS_LIST">
    <li v-for="agent in customAgents" :key="agent.id" class="flex flex-col gap-0.5 rounded-md bg-elevated px-2 py-1.5">
      <span class="font-mono text-[12px] text-secondary">{{ agent.label }}</span>
      <span class="truncate font-mono text-[11px] text-dim" :title="agent.command">{{ agent.command }}</span>
    </li>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">{{ t("settings.models.noCustomAgents") }}</p>

  <!-- Accounts (#2215): unlike the providers/custom-agents lists above, an account is not resolved
       and not run as written — it is just a login's config directory, so a form for it carries the
       same amount of risk as the launcher/MCP-server forms elsewhere in Settings. -->
  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">{{ t("settings.models.accountsTitle") }}</strong> (<code>accounts</code>) {{ t("settings.models.accountsIntro") }}
  </p>
  <ul v-if="accountList.length" data-testid="settings-accounts" :class="SETTINGS_LIST">
    <SettingsListRow v-for="account in accountList" :key="account.id" :name="account.label" @remove="removeAccount(account.id)">
      <span class="flex-none font-mono text-[12px] text-secondary">{{ account.label }}</span>
      <span class="flex-none text-[11px] text-dim">{{ account.agent }}</span>
      <code class="min-w-0 flex-auto truncate font-mono text-[11px] text-dim" :title="account.home">{{ account.home }}</code>
      <span v-if="account.oauthTokenEnvVar" class="flex-none font-mono text-[11px] text-dim">{{ account.oauthTokenEnvVar }}</span>
    </SettingsListRow>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">{{ t("settings.models.noAccounts") }}</p>
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <SettingsField
      v-model="newAccountId"
      class="min-w-0 shrink grow basis-[14%]"
      :placeholder="t('settings.models.accountIdPlaceholder')"
      :aria-label="t('settings.models.accountIdField')"
      spellcheck="false"
      @keydown.enter="addAccount"
    />
    <SettingsField
      v-model="newAccountLabel"
      class="min-w-0 shrink grow basis-[16%]"
      :placeholder="t('settings.models.accountLabelPlaceholder')"
      :aria-label="t('settings.models.accountLabelField')"
      spellcheck="false"
      @keydown.enter="addAccount"
    />
    <select v-model="newAccountAgent" :class="[SELECT_CONTROL, 'w-auto shrink-0 basis-[12%]']" :aria-label="t('settings.models.accountAgentField')">
      <option value="" disabled>{{ t("settings.models.accountAgentField") }}</option>
      <option v-for="agent in ACCOUNT_AGENTS" :key="agent" :value="agent">{{ agent }}</option>
    </select>
    <SettingsField
      v-model="newAccountHome"
      class="min-w-0 flex-auto font-mono"
      :placeholder="t('settings.models.accountHomePlaceholder')"
      :aria-label="t('settings.models.accountHomeField')"
      spellcheck="false"
      @keydown.enter="addAccount"
    />
    <SettingsField
      v-model="newAccountTokenEnvVar"
      class="min-w-0 shrink grow basis-[18%] font-mono"
      :placeholder="t('settings.models.accountTokenEnvVarPlaceholder')"
      :aria-label="t('settings.models.accountTokenEnvVarField')"
      spellcheck="false"
      @keydown.enter="addAccount"
    />
    <SettingsButton :disabled="!newAccountValid" @click="addAccount">{{ t("settings.common.add") }}</SettingsButton>
  </div>

  <div class="mb-3 mt-2">
    <SkillLaunchButton skill="mulmoterminal-model" icon="network_node" :label="t('settings.models.addBackend')" @launch="$emit('launch-skill', $event)" />
  </div>
</template>
