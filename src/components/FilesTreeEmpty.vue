<script setup lang="ts">
// An empty folder in the Files tree (#2694): it has no row to open the menu on, so what the menu would
// offer there — a new file or folder — is right here, reachable from the keyboard too.
import { useI18n } from "vue-i18n";
import type { FilesRowAction } from "./filesRowActions";

defineProps<{ actions: FilesRowAction[] }>();
const emit = defineEmits<{ run: [action: FilesRowAction]; menu: [event: MouseEvent] }>();
const { t } = useI18n();
</script>

<template>
  <div data-testid="files-tree-empty" class="flex flex-col items-start gap-1 p-4 text-[13px] text-muted" @contextmenu="emit('menu', $event)">
    {{ t("filesRowMenu.emptyFolder") }}
    <button
      v-for="action in actions"
      :key="action.id"
      type="button"
      :data-testid="`files-empty-${action.id}`"
      class="rounded border border-border px-2 py-0.5 text-[12px] hover:bg-hover"
      @click="emit('run', action)"
    >
      {{ t(action.labelKey) }}
    </button>
  </div>
</template>
