<script setup lang="ts">
// The Files pane's Edit / Preview switch, and the side-by-side toggle beside it for Markdown (#2577).
import { useI18n } from "vue-i18n";

defineProps<{ showPreview: boolean; saving: boolean; canSideBySide: boolean; sideBySide: boolean }>();
const emit = defineEmits<{ togglePreview: []; toggleSideBySide: [] }>();
const { t } = useI18n();
const BUTTON =
  "h-[26px] cursor-pointer rounded-md border border-border px-2.5 py-1 text-[12px] enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50";
</script>

<template>
  <button type="button" :class="[BUTTON, 'bg-base text-secondary']" :disabled="saving" @click="emit('togglePreview')">
    {{ showPreview ? "Edit" : "Preview" }}
  </button>
  <button
    v-if="canSideBySide"
    type="button"
    data-testid="files-side-by-side"
    :class="[BUTTON, sideBySide ? 'bg-selected text-fg' : 'bg-base text-secondary']"
    :aria-pressed="sideBySide"
    :aria-label="t('tips.panes.sideBySide')"
    :data-tip="t('tips.panes.sideBySide')"
    :disabled="saving"
    @click="emit('toggleSideBySide')"
  >
    <span class="material-symbols-outlined text-[16px] leading-none" aria-hidden="true">vertical_split</span>
  </button>
</template>
