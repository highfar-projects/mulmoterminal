<script setup lang="ts">
// The folder view's own buttons (#3120): up a folder, list or gallery, and whether subfolders are read.
import { useI18n } from "vue-i18n";
import { FOLDER_VIEW_MODES, type FolderViewMode } from "./folderView";

defineProps<{ mode: FolderViewMode; withSubfolders: boolean; canGoUp: boolean }>();
const emit = defineEmits<{ mode: [FolderViewMode]; subfolders: [boolean]; up: [] }>();
const { t } = useI18n();

const MODE_ICON: Record<FolderViewMode, string> = { list: "list", gallery: "photo_library" };
const MODE_LABEL: Record<FolderViewMode, string> = { list: "filesFolderView.list", gallery: "filesFolderView.gallery" };

const BUTTON = "inline-flex h-[26px] flex-none cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-[12px] hover:bg-hover hover:text-fg";
const tone = (on: boolean): string => (on ? "bg-selected text-fg" : "bg-base text-secondary");
</script>

<template>
  <button
    v-if="canGoUp"
    type="button"
    :class="[BUTTON, tone(false)]"
    :aria-label="t('filesFolderView.up')"
    :data-tip="t('filesFolderView.up')"
    data-testid="files-folder-up"
    @click="emit('up')"
  >
    <span class="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_upward</span>
  </button>
  <button
    type="button"
    :class="[BUTTON, tone(withSubfolders)]"
    :aria-pressed="withSubfolders"
    :aria-label="t('filesFolderView.withSubfolders')"
    :data-tip="t('filesFolderView.withSubfolders')"
    data-testid="files-folder-subfolders"
    @click="emit('subfolders', !withSubfolders)"
  >
    <span class="material-symbols-outlined text-[16px]" aria-hidden="true">account_tree</span>
  </button>
  <span class="inline-flex flex-none gap-0.5" role="group">
    <button
      v-for="option in FOLDER_VIEW_MODES"
      :key="option"
      type="button"
      :class="[BUTTON, tone(option === mode)]"
      :aria-pressed="option === mode"
      :aria-label="t(MODE_LABEL[option])"
      :data-tip="t(MODE_LABEL[option])"
      :data-testid="`files-folder-mode-${option}`"
      @click="emit('mode', option)"
    >
      <span class="material-symbols-outlined text-[16px]" aria-hidden="true">{{ MODE_ICON[option] }}</span>
    </button>
  </span>
</template>
