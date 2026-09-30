<script setup lang="ts">
// The end of one row of the directory form: whether the checkout's own file holds the key, the way to
// move it between that file and the shared one (#2728), and the way back to the global setting.
import { useI18n } from "vue-i18n";
import type { DirFormKey } from "../../../common/dirConfigForm";

// `movable: false` for a row that is not one key (the model select writes two).
withDefaults(defineProps<{ formKey: DirFormKey; isSet: boolean; isLocal: boolean; saving: boolean; movable?: boolean }>(), { movable: true });
const emit = defineEmits<{ (e: "clear"): void; (e: "move", to: "local" | "shared"): void }>();
const { t } = useI18n();

const CLEAR_BUTTON =
  "flex-none cursor-pointer rounded border border-border bg-elevated px-1.5 py-0.5 font-sans text-[11px] text-secondary hover:bg-hover hover:text-fg disabled:opacity-60";
</script>

<template>
  <span v-if="isLocal" class="flex-none text-[10px] text-dim">{{ t("dirSettingsForm.local") }}</span>
  <button
    v-if="isSet && movable"
    type="button"
    :class="CLEAR_BUTTON"
    :disabled="saving"
    :data-tip="t(isLocal ? 'dirSettingsForm.move.toSharedTip' : 'dirSettingsForm.move.toLocalTip')"
    :data-testid="`dir-form-move-${formKey}`"
    @click="emit('move', isLocal ? 'shared' : 'local')"
  >
    {{ t(isLocal ? "dirSettingsForm.move.toShared" : "dirSettingsForm.move.toLocal") }}
  </button>
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
