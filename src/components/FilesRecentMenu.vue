<script setup lang="ts">
// "Recently opened" in the Files header (#3058): the files this directory had open, newest first, so
// one whose tab was closed can be found again. Not the History menu beside it, which lists earlier
// versions of ONE file (#2574) — the label and the icon say which is which.
import { useId, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import FilesToolbarButton from "./FilesToolbarButton.vue";
import { useDropdownMenu } from "../composables/useDropdownMenu";
import { useRecentFiles } from "../composables/useRecentFiles";

const props = defineProps<{ cwd: string | null; openPath: string | null }>();
const emit = defineEmits<{ open: [pathRel: string] }>();
const { t } = useI18n();
const { recent, refresh } = useRecentFiles(
  () => props.cwd,
  () => props.openPath,
);
const root = useTemplateRef<HTMLElement>("root");
// Read again on opening: another pane or tab may have recorded since.
const { open, close, toggle } = useDropdownMenu(root, refresh);
// Per instance: two panes can be mounted at once, and `aria-controls` must name this one's list.
const listId = `files-recent-list-${useId()}`;

// The entry pressed is about to leave the page; keep the keyboard where the list came from.
function pick(pathRel: string): void {
  close();
  root.value?.querySelector<HTMLElement>('[data-testid="files-recent-btn"]')?.focus();
  emit("open", pathRel);
}
const nameOf = (pathRel: string): string => pathRel.split("/").at(-1) ?? pathRel;
const dirOf = (pathRel: string): string => pathRel.split("/").slice(0, -1).join("/");
</script>

<template>
  <div ref="root" class="relative">
    <FilesToolbarButton
      icon="schedule"
      :label="t('filesRecent.tip')"
      test-id="files-recent-btn"
      opens-a-panel
      :aria-expanded="open"
      :aria-controls="listId"
      @click="toggle"
    />
    <div
      v-if="open"
      :id="listId"
      data-testid="files-recent"
      class="absolute right-0 top-[30px] z-20 max-h-[60vh] w-[300px] overflow-y-auto rounded-md border border-border bg-base p-1 text-[12px] shadow-lg"
    >
      <p class="px-2 py-1 text-muted">{{ t("filesRecent.title") }}</p>
      <p v-if="recent.length === 0" class="px-2 py-1 text-secondary">{{ t("filesRecent.empty") }}</p>
      <button
        v-for="pathRel in recent"
        :key="pathRel"
        type="button"
        data-testid="files-recent-entry"
        :data-path="pathRel"
        :aria-current="pathRel === openPath ? 'true' : undefined"
        class="flex w-full cursor-pointer items-baseline gap-2 rounded border-0 px-2 py-1 text-left font-mono hover:bg-hover"
        :class="pathRel === openPath ? 'bg-selected text-fg' : 'bg-transparent text-secondary'"
        @click="pick(pathRel)"
      >
        <span class="truncate text-fg">{{ nameOf(pathRel) }}</span>
        <span class="min-w-0 flex-1 truncate text-[11px] text-dim">{{ dirOf(pathRel) }}</span>
      </button>
    </div>
  </div>
</template>
