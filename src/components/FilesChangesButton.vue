<script setup lang="ts">
// Removed lines shown in place, as a unified diff, rather than marks alone.
import { useI18n } from "vue-i18n";

defineProps<{ pressed: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const { t } = useI18n();
</script>

<template>
  <button
    type="button"
    data-testid="files-changes-btn"
    class="h-[26px] cursor-pointer rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-hover hover:text-fg"
    :class="pressed ? 'bg-selected text-fg' : 'bg-base text-secondary'"
    :aria-pressed="pressed"
    :data-tip="t('tips.panes.showChanges')"
    @click="emit('toggle')"
  >
    Changes
  </button>
</template>
