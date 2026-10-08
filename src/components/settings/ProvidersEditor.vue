<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useLaunchOptions } from "../../composables/useLaunchOptions";
import { changeProviders } from "../../composables/providersEditing";
import { useEntryListEditor } from "../../composables/useEntryListEditor";
import { buildProvider, RECOMMENDED_MAX_OUTPUT_TOKENS, type ProviderProblem } from "../../../common/providerEntries";
import { isOfferable, notOfferedReason } from "../launchOffer";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import SettingsListRow from "./SettingsListRow.vue";
import { SETTINGS_LIST } from "./sectionClasses";

// The backends, as /api/launch-options resolves them (is the key set? is there a model?), with a
// remove per row and a form to add one (#2621). Each add or remove is one entry, on the server.
const { t } = useI18n();
const { launchOptions } = useLaunchOptions();

const draft = ref({ label: "", baseUrl: "", tokenEnv: "", models: "", maxOutputTokens: String(RECOMMENDED_MAX_OUTPUT_TOKENS) });
const { saving, refused, serverProblem, apply, remove } = useEntryListEditor(changeProviders);
const built = computed(() =>
  buildProvider(
    draft.value,
    launchOptions.value.providers.map((provider) => provider.id),
  ),
);
const typed = computed(() => [draft.value.label, draft.value.baseUrl, draft.value.tokenEnv, draft.value.models].some((field) => field.trim() !== ""));
// Said once something is typed: an empty form is not a mistake.
const problem = computed<ProviderProblem | null>(() => (typed.value && "problem" in built.value ? built.value.problem : serverProblem.value));

async function add() {
  if (!("entry" in built.value) || saving.value) return;
  if (await apply("add", { ...draft.value }))
    draft.value = { label: "", baseUrl: "", tokenEnv: "", models: "", maxOutputTokens: String(RECOMMENDED_MAX_OUTPUT_TOKENS) };
}

const FIELD = "min-w-0 font-mono";
</script>

<template>
  <ul v-if="launchOptions.providers.length" :class="SETTINGS_LIST" data-testid="settings-providers">
    <SettingsListRow v-for="p in launchOptions.providers" :key="p.id" :name="p.label" :disabled="saving" @remove="remove(p.id)">
      <span class="min-w-0 max-w-[40%] truncate font-mono text-[12px] text-secondary" :data-tip="p.label">{{ p.label }}</span>
      <span class="min-w-0 flex-auto truncate text-[11px] text-dim">
        {{ t("settings.models.modelCount", { count: p.models.length }, p.models.length) }} · {{ t("settings.models.keyIn", { env: p.tokenEnv }) }}
      </span>
      <span v-if="!p.ready" class="shrink-0 text-[11px] text-err-text" :data-tip="p.reason">{{ t("settings.models.notReady") }}</span>
      <!-- Reachable, and still not a choice: a session cannot start on a provider without a model, so
           the launch picker leaves it out. Said here because "ready · 0 models" reads like it works (#1432). -->
      <span v-else-if="!isOfferable(p)" class="shrink-0 text-[11px] text-err-text" :data-tip="notOfferedReason(p) ?? ''">
        {{ t("settings.models.notInPicker") }}
      </span>
      <span v-else class="shrink-0 text-[11px] text-dim">{{ t("settings.models.ready") }}</span>
    </SettingsListRow>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">{{ t("settings.models.noProviders") }}</p>
  <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
    <SettingsField
      v-model="draft.label"
      :class="FIELD"
      data-testid="provider-label"
      :placeholder="t('settingsControls.providers.labelPlaceholder')"
      :aria-label="t('settingsControls.providers.labelField')"
      spellcheck="false"
    />
    <SettingsField
      v-model="draft.baseUrl"
      :class="FIELD"
      data-testid="provider-base-url"
      placeholder="https://openrouter.ai/api"
      :aria-label="t('settingsControls.providers.baseUrlField')"
      spellcheck="false"
    />
    <SettingsField
      v-model="draft.tokenEnv"
      :class="FIELD"
      data-testid="provider-token-env"
      placeholder="OPENROUTER_API_KEY"
      :aria-label="t('settingsControls.providers.tokenEnvField')"
      spellcheck="false"
    />
    <SettingsField
      v-model="draft.maxOutputTokens"
      :class="FIELD"
      data-testid="provider-max-output"
      :aria-label="t('settingsControls.providers.maxOutputField')"
      inputmode="numeric"
      spellcheck="false"
    />
    <SettingsField
      v-model="draft.models"
      :class="`${FIELD} sm:col-span-2`"
      data-testid="provider-models"
      :placeholder="t('settingsControls.providers.modelsPlaceholder')"
      :aria-label="t('settingsControls.providers.modelsField')"
      spellcheck="false"
      @keydown.enter="add"
    />
  </div>
  <div class="mt-1.5 flex items-start gap-2">
    <p class="m-0 min-w-0 flex-auto text-[11px] text-dim">{{ t("settingsControls.providers.hint") }}</p>
    <SettingsButton data-testid="provider-add" :disabled="!('entry' in built) || saving" @click="add">{{ t("settings.common.add") }}</SettingsButton>
  </div>
  <p v-if="problem" class="mt-1 text-[11px] text-err-text" data-testid="provider-problem">{{ t(`settingsControls.providerProblems.${problem}`) }}</p>
  <p v-if="refused" class="mt-1 text-[11px] text-err-text" data-testid="provider-refused">{{ t("settingsControls.entryProblems.refused") }}</p>
</template>
