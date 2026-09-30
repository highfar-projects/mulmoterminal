<script setup lang="ts">
import { useI18n } from "vue-i18n";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import CustomAgentsEditor from "./CustomAgentsEditor.vue";
import AccountsEditor from "./AccountsEditor.vue";
import ProvidersEditor from "./ProvidersEditor.vue";
import { computed, ref } from "vue";
import { defaultAgentRef, saveDefaultAgent } from "../../composables/defaultAgent";
import { useAgentAvailability } from "../../composables/useAgentAvailability";
import { agentFromChoiceValue, choiceValue, defaultAgentChoices, type DefaultAgentChoice } from "./defaultAgentChoices";

const { t } = useI18n();
import type { BundledSkillName } from "../../../common/bundledSkills";

defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void }>();

const { unavailableAgents, confirmedAgents } = useAgentAvailability();
const agentChoices = computed(() => defaultAgentChoices(confirmedAgents.value, defaultAgentRef.value));
const agentOverridden = ref(false);
const savingAgent = ref(false);

const optionLabel = (choice: DefaultAgentChoice): string => {
  if (choice.agent === null) return t("settingsControls.defaultAgent.unset");
  return unavailableAgents.value.has(choice.agent) ? t("settingsControls.defaultAgent.notInstalled", { agent: choice.label }) : (choice.label ?? choice.agent);
};

// Locked while a save is in flight, so a slower answer to an earlier pick cannot land after a later
// one. A refused save leaves the select where the browser moved it, so it is put back to what the host holds.
async function onDefaultAgentChange(e: Event) {
  if (!(e.target instanceof HTMLSelectElement)) return;
  const select = e.target;
  savingAgent.value = true;
  const saved = await saveDefaultAgent(agentFromChoiceValue(select.value));
  savingAgent.value = false;
  agentOverridden.value = saved.ok && saved.overridden;
  select.value = choiceValue(defaultAgentRef.value);
}
</script>

<template>
  <p class="mb-1.5 mt-1.5 text-[12px] text-dim">
    <strong class="text-fg">{{ t("settingsControls.defaultAgent.title") }}</strong> (<code>defaultAgent</code>) — {{ t("settingsControls.defaultAgent.hint") }}
  </p>
  <select
    class="mb-1 w-full cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1.5 text-[12px] text-fg"
    data-testid="settings-default-agent"
    :value="choiceValue(defaultAgentRef)"
    :disabled="savingAgent"
    :aria-label="t('settingsControls.defaultAgent.field')"
    @change="(e) => void onDefaultAgentChange(e)"
  >
    <option v-for="choice in agentChoices" :key="choiceValue(choice.agent)" :value="choiceValue(choice.agent)" :disabled="choice.disabled">
      {{ optionLabel(choice) }}
    </option>
  </select>
  <p v-if="agentOverridden" class="mb-2 text-[12px] text-[var(--warn-text,#e0a030)]" data-testid="settings-default-agent-overridden">
    {{ t("settingsControls.defaultAgent.overridden") }}
  </p>

  <i18n-t keypath="settings.models.intro" tag="p" class="mb-2 mt-1.5 text-[12px] text-dim">
    <template #providersKey><code>providers</code></template>
    <template #configFile><code>~/.mulmoterminal/config.json</code></template>
    <template #providerKey><code>provider</code></template>
    <template #modelKey><code>model</code></template>
    <template #dirFile><code>.mulmoterminal.json</code></template>
  </i18n-t>
  <ProvidersEditor />

  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">{{ t("settings.models.customTitle") }}</strong> (<code>customAgents</code>) {{ t("settings.models.customIntro") }}
  </p>
  <CustomAgentsEditor />

  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">{{ t("settings.models.accountsTitle") }}</strong> (<code>accounts</code>) {{ t("settings.models.accountsIntro") }}
  </p>
  <AccountsEditor />

  <div class="mb-3 mt-2">
    <SkillLaunchButton skill="mulmoterminal-model" icon="network_node" :label="t('settings.models.addBackend')" @launch="$emit('launch-skill', $event)" />
  </div>
</template>
