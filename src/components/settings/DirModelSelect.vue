<script setup lang="ts">
// Which backend and model a directory's sessions start on (`provider` / `model`, #2725), picked from
// the providers the global config declares — the same ones the launch picker offers, by the same
// rule (`isOfferable`): a provider the server cannot start a session on would make it the default
// for every cell here, and each would refuse to start. A choice the file already makes that the list
// does not hold (a provider since removed or not ready, a model typed by hand) is still shown, so
// opening the form never looks like it changed the directory.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useLaunchOptions } from "../../composables/useLaunchOptions";
import { isOfferable } from "../launchOffer";
import { modelOptionLabel, sortedModels } from "../modelOption";
import { currentModelChoice, modelChoiceValue } from "../dirSettingsFormFields";

const props = defineProps<{ values: Record<string, unknown>; saving: boolean }>();
const emit = defineEmits<{ (e: "choose", choice: string): void }>();
const { t } = useI18n();
const { launchOptions } = useLaunchOptions();

const offerable = computed(() => launchOptions.value.providers.filter(isOfferable));
const current = computed(() => currentModelChoice(props.values));
const listed = computed(() => offerable.value.some((provider) => provider.models.some((model) => modelChoiceValue(provider.id, model.id) === current.value)));

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
    <optgroup v-for="provider in offerable" :key="provider.id" :label="provider.label">
      <option v-for="model in sortedModels(provider.models)" :key="model.id" :value="modelChoiceValue(provider.id, model.id)">
        {{ modelOptionLabel(model) }}
      </option>
    </optgroup>
  </select>
</template>
