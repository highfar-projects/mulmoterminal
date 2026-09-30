<script setup lang="ts">
// Which backend and model a directory's sessions start on (`provider` / `model`, #2725), picked from
// the providers the global config declares — the same list the launch picker offers. A choice the
// file already makes that the list does not hold (a provider since removed, a model typed by hand)
// is still shown, so opening the form never looks like it changed the directory.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useLaunchOptions } from "../../composables/useLaunchOptions";
import { modelOptionLabel, sortedModels } from "../modelOption";
import { currentModelChoice, modelChoiceValue } from "../dirSettingsFormFields";

const props = defineProps<{ values: Record<string, unknown>; saving: boolean }>();
const emit = defineEmits<{ (e: "choose", choice: string): void }>();
const { t } = useI18n();
const { launchOptions } = useLaunchOptions();

const withModels = computed(() => launchOptions.value.providers.filter((provider) => provider.models.length > 0));
const current = computed(() => currentModelChoice(props.values));
const listed = computed(() => withModels.value.some((provider) => provider.models.some((model) => modelChoiceValue(provider.id, model.id) === current.value)));

function onChange(e: Event): void {
  if (e.target instanceof HTMLSelectElement && e.target.value !== current.value) emit("choose", e.target.value);
}
</script>

<template>
  <select
    id="dir-form-model"
    class="min-w-0 flex-auto rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-fg disabled:opacity-60"
    :value="current"
    :disabled="saving"
    data-testid="dir-form-model-select"
    @change="onChange"
  >
    <option value="">{{ t("dirSettingsForm.modelDefault") }}</option>
    <option v-if="current !== '' && !listed" :value="current">{{ t("dirSettingsForm.modelUnlisted", { choice: current.replace("|", " / ") }) }}</option>
    <optgroup
      v-for="provider in withModels"
      :key="provider.id"
      :label="provider.ready ? provider.label : t('dirSettingsForm.modelNotReady', { label: provider.label })"
    >
      <option v-for="model in sortedModels(provider.models)" :key="model.id" :value="modelChoiceValue(provider.id, model.id)">
        {{ modelOptionLabel(model) }}
      </option>
    </optgroup>
  </select>
</template>
