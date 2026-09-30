<script setup lang="ts">
// The end of one row of the directory form: whether the checkout's own file holds the key, and the
// way back to the global setting when the directory sets it.
import { useI18n } from "vue-i18n";
import type { DirFormKey } from "../../../common/dirConfigForm";

defineProps<{ formKey: DirFormKey; isSet: boolean; isLocal: boolean; saving: boolean }>();
const emit = defineEmits<{ (e: "clear"): void }>();
const { t } = useI18n();

const CLEAR_BUTTON =
  "flex-none cursor-pointer rounded border border-border bg-elevated px-1.5 py-0.5 font-sans text-[11px] text-secondary hover:bg-hover hover:text-fg disabled:opacity-60";
</script>

<template>
  <span v-if="isLocal" class="flex-none text-[10px] text-dim">{{ t("dirSettingsForm.local") }}</span>
  <button
    v-if="isSet"
    type="button"
    :class="CLEAR_BUTTON"
    :disabled="saving"
    :data-tip="t('dirSettingsForm.useGlobalTip')"
    :data-testid="`dir-form-clear-${formKey}`"
    @click="emit('clear')"
  >
    {{ t("dirSettingsForm.useGlobal") }}
  </button>
</template>
