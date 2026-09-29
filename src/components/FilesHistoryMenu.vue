<script setup lang="ts">
// The Files pane's History button and the list it opens (#2574): a file's stored versions, each of
// which can be compared with the buffer or restored into it. The pane owns what those do.
import { onBeforeUnmount, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { BackupEntry } from "../../common/fileBackups";

const props = defineProps<{ open: boolean; entries: BackupEntry[]; failed: boolean }>();
const emit = defineEmits<{ toggle: []; close: []; compare: [entry: BackupEntry]; restore: [entry: BackupEntry] }>();

// A click anywhere else closes it, as a menu does — it floats over the tree and the editor.
const root = useTemplateRef<HTMLElement>("root");
const onPointerDown = (event: PointerEvent): void => {
  if (event.target instanceof Node && !root.value?.contains(event.target)) emit("close");
};
watch(
  () => props.open,
  (open) => (open ? document.addEventListener("pointerdown", onPointerDown) : document.removeEventListener("pointerdown", onPointerDown)),
);
onBeforeUnmount(() => document.removeEventListener("pointerdown", onPointerDown));
const { t, locale } = useI18n();
const backupTime = (at: number): string => new Date(at).toLocaleString(locale.value);
const ROW_BUTTON = "cursor-pointer rounded px-1.5 py-0.5 text-secondary hover:bg-selected hover:text-fg";
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="emit('close')">
    <button
      type="button"
      data-testid="files-history-btn"
      class="flex h-[26px] cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-hover hover:text-fg"
      :class="open ? 'bg-selected text-fg' : 'bg-base text-secondary'"
      :aria-expanded="open"
      aria-haspopup="true"
      aria-controls="files-history-list"
      :data-tip="t('fileHistory.tip')"
      @click="emit('toggle')"
    >
      <span class="material-symbols-outlined text-[14px]" aria-hidden="true">history</span>{{ t("fileHistory.button") }}
    </button>
    <div
      v-if="open"
      data-testid="files-history"
      class="absolute right-0 top-[30px] z-20 w-[280px] rounded-md border border-border bg-base p-1 text-[12px] shadow-lg"
    >
      <p class="px-2 py-1 text-muted">{{ t("fileHistory.title") }}</p>
      <p v-if="failed" role="alert" class="px-2 py-1 text-err">{{ t("fileHistory.failed") }}</p>
      <p v-else-if="entries.length === 0" class="px-2 py-1 text-secondary">{{ t("fileHistory.empty") }}</p>
      <div v-for="entry in entries" :key="entry.id" data-testid="files-history-entry" class="flex items-center gap-1 rounded px-2 py-1 hover:bg-hover">
        <span class="flex-auto text-fg">{{ backupTime(entry.at) }}</span>
        <button
          type="button"
          data-testid="files-history-compare"
          :class="ROW_BUTTON"
          :aria-label="`${t('fileHistory.compare')} ${backupTime(entry.at)}`"
          @click="emit('compare', entry)"
        >
          {{ t("fileHistory.compare") }}
        </button>
        <button
          type="button"
          data-testid="files-history-restore"
          :class="ROW_BUTTON"
          :aria-label="`${t('fileHistory.restore')} ${backupTime(entry.at)}`"
          @click="emit('restore', entry)"
        >
          {{ t("fileHistory.restore") }}
        </button>
      </div>
    </div>
  </div>
</template>
