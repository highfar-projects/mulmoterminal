<script setup lang="ts">
// Shown while the change marks are drawn against a stored version instead of HEAD (#2574), so it is
// never a mystery why the marks changed — with the two ways out.
import { useI18n } from "vue-i18n";

defineProps<{ at: number; failed: boolean }>();
const emit = defineEmits<{ restore: []; stop: [] }>();
const { t, locale } = useI18n();
const BUTTON = "h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary hover:bg-hover hover:text-fg";
</script>

<template>
  <div
    data-testid="files-comparing"
    role="status"
    class="flex flex-none flex-wrap items-center gap-2 border-b border-border bg-subtle px-4 py-1.5 text-[13px] text-secondary"
  >
    <span class="material-symbols-outlined" aria-hidden="true">history</span>
    <span class="flex-auto">{{ t("fileHistory.comparing", { time: new Date(at).toLocaleString(locale) }) }}</span>
    <span v-if="failed" role="alert" class="text-err">{{ t("fileHistory.restoreFailed") }}</span>
    <button type="button" data-testid="files-comparing-restore" :class="BUTTON" @click="emit('restore')">{{ t("fileHistory.restore") }}</button>
    <button type="button" data-testid="files-comparing-stop" :class="BUTTON" @click="emit('stop')">{{ t("fileHistory.stop") }}</button>
  </div>
</template>
