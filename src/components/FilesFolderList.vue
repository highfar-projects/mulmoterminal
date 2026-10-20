<script setup lang="ts">
// A folder's entries as a list (#3120), one group per folder read, each under its path. A folder row
// shows that folder; a file row opens it, Cmd/Ctrl+click in a tab of its own, as the tree does.
import { computed } from "vue";
import { formatSize, groupHeading, joinRel, listRows, type FolderGroup } from "./folderView";
import { galleryKind } from "./filesGallery";
import type { FileMediaKind } from "./filePreviewKind";
import { wantsNewTab } from "../composables/newTabModifier";
import type { ListingEntry } from "./filesTreeCache";

const props = defineProps<{ dir: string; groups: FolderGroup[] }>();
const emit = defineEmits<{ show: [string]; open: [string, boolean] }>();

const sections = computed(() =>
  props.groups.map((group) => ({ dirRel: group.dirRel, heading: groupHeading(props.dir, group.dirRel), rows: listRows(group.entries) })),
);

const KIND_ICON: Record<FileMediaKind, string> = { image: "image", video: "movie", audio: "music_note", pdf: "picture_as_pdf" };
const iconOf = (entry: ListingEntry): string => {
  if (entry.dir) return "folder";
  const kind = galleryKind(entry.name);
  return kind ? KIND_ICON[kind] : "description";
};

function pick(dirRel: string, entry: ListingEntry, event: MouseEvent): void {
  const pathRel = joinRel(dirRel, entry.name);
  if (entry.dir) emit("show", pathRel);
  else emit("open", pathRel, wantsNewTab(event));
}
</script>

<template>
  <div class="min-h-0 flex-auto overflow-auto py-1.5" data-testid="files-folder-list">
    <section v-for="section in sections" :key="section.dirRel">
      <h3 v-if="section.heading !== null" class="m-0 mt-2 truncate px-3 py-1 font-mono text-[12px] font-normal text-muted" data-testid="files-folder-heading">
        {{ section.heading }}/
      </h3>
      <button
        v-for="entry in section.rows"
        :key="entry.name"
        type="button"
        data-testid="files-folder-row"
        :data-path="joinRel(section.dirRel, entry.name)"
        class="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap border-0 bg-transparent px-3 py-[3px] text-left font-mono text-[12px] text-secondary hover:bg-hover hover:text-fg"
        @click="pick(section.dirRel, entry, $event)"
      >
        <span class="material-symbols-outlined flex-none text-[16px]" aria-hidden="true">{{ iconOf(entry) }}</span>
        <span class="min-w-0 flex-auto truncate">{{ entry.name }}</span>
        <span v-if="!entry.dir" class="flex-none pl-2 text-[11px] text-muted">{{ formatSize(entry.size) }}</span>
      </button>
    </section>
  </div>
</template>
