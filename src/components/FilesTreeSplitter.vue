<script setup lang="ts">
// The handle between the tree and the file. The pane's pointer and key listeners fall through to it.
import { useI18n } from "vue-i18n";

defineProps<{ width: number; min: number; max: number | undefined }>();

const { t } = useI18n();
</script>

<template>
  <div
    data-testid="files-tree-splitter"
    class="w-[5px] flex-none cursor-col-resize bg-border hover:bg-accent focus-visible:bg-accent"
    role="separator"
    aria-orientation="vertical"
    :aria-label="t('tips.panes.fileTreeResize')"
    :aria-valuenow="width"
    :aria-valuemin="min"
    :aria-valuemax="max"
    tabindex="0"
  />
</template>
