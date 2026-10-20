<script setup lang="ts">
// The folder shown in the Files pane's empty file area (#3120), as a list or as the gallery.
import { computed, onBeforeUpdate, onUpdated, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import FilesFolderList from "./FilesFolderList.vue";
import FilesFolderViewControls from "./FilesFolderViewControls.vue";
import FilesGallery from "./FilesGallery.vue";
import { parentOf } from "./filesGallery";
import { folderGalleryItems, folderTitle, type FolderGroup, type FolderViewMode } from "./folderView";

const props = defineProps<{
  cwd: string | null;
  dir: string;
  groups: FolderGroup[] | null;
  error: string | null;
  mode: FolderViewMode;
  withSubfolders: boolean;
}>();
const emit = defineEmits<{ show: [string]; open: [string, boolean]; mode: [FolderViewMode]; subfolders: [boolean] }>();
const { t } = useI18n();

const galleryItems = computed(() => (props.groups ? folderGalleryItems(props.groups) : null));
const isEmpty = computed(() => props.groups !== null && props.groups.every((group) => group.entries.length === 0));
const controls = computed(() => ({ mode: props.mode, withSubfolders: props.withSubfolders, canGoUp: props.dir !== "" }));
const controlEvents = {
  mode: (mode: FolderViewMode) => emit("mode", mode),
  subfolders: (on: boolean) => emit("subfolders", on),
  up: () => emit("show", parentOf(props.dir)),
};

// What the keyboard was on can go with what it was in: the header is swapped with the mode, the rows
// with "Reading the folder", Up at the root. It is put back in the view rather than left on the page,
// on the pressed mode's own button when that is what changed.
const root = useTemplateRef<HTMLElement>("root");
let renderedMode = props.mode;
let keyboardInside = false;
onBeforeUpdate(() => {
  keyboardInside = root.value?.contains(document.activeElement) ?? false;
});
onUpdated(() => {
  const modeChanged = renderedMode !== props.mode;
  renderedMode = props.mode;
  if (!keyboardInside || root.value?.contains(document.activeElement)) return;
  const pressed = modeChanged ? root.value?.querySelector<HTMLElement>(`[data-testid="files-folder-mode-${props.mode}"]`) : null;
  (pressed ?? root.value)?.focus();
});
</script>

<template>
  <div ref="root" tabindex="-1" class="relative flex min-h-0 min-w-0 flex-auto flex-col bg-deep outline-none" data-testid="files-folder-view">
    <FilesGallery v-if="mode === 'gallery'" v-bind="{ cwd, dir, items: galleryItems, error }" :closable="false">
      <template #controls><FilesFolderViewControls v-bind="controls" v-on="controlEvents" /></template>
    </FilesGallery>
    <template v-else>
      <header class="flex flex-none items-center gap-2 border-b border-border px-3 py-1.5">
        <span class="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">folder_open</span>
        <span class="min-w-0 flex-auto truncate font-mono text-[12px] text-secondary" :data-tip="dir || undefined">{{ folderTitle(cwd, dir) }}</span>
        <FilesFolderViewControls v-bind="controls" v-on="controlEvents" />
      </header>
      <p v-if="error" role="alert" class="p-4 text-[13px] text-err">{{ error }}</p>
      <p v-else-if="groups === null" class="m-auto p-4 text-[13px] text-muted">{{ t("filesGallery.loading") }}</p>
      <p v-else-if="isEmpty" class="m-auto p-4 text-[13px] text-muted" data-testid="files-folder-empty">{{ t("filesFolderView.empty") }}</p>
      <FilesFolderList v-else :dir="dir" :groups="groups" @show="(path) => emit('show', path)" @open="(path, newTab) => emit('open', path, newTab)" />
    </template>
  </div>
</template>
