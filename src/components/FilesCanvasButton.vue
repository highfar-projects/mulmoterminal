<script setup lang="ts">
// The Files pane's switch between the file's editor and its Canvas view (#3008).
import { useI18n } from "vue-i18n";

defineProps<{ active: boolean; disabled: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const { t } = useI18n();
</script>

<template>
  <button
    type="button"
    data-testid="files-canvas-btn"
    class="h-[26px] cursor-pointer rounded-md border border-border px-2.5 py-1 text-[12px] enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"
    :class="active ? 'bg-selected text-fg' : 'bg-base text-secondary'"
    :aria-pressed="active"
    :data-tip="t('tips.panes.openInCanvas')"
    :disabled="disabled"
    @click="emit('toggle')"
  >
    Canvas
  </button>
</template>
