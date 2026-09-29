<script setup lang="ts">
// The Files pane's Outline button and the headings it lists (#2576). Its own open state and
// dismissal (useDropdownMenu); the pane reads the headings when it opens and does the going.
import { useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { useDropdownMenu } from "../composables/useDropdownMenu";
import type { OutlineHeading } from "./markdownOutline";

defineProps<{ headings: OutlineHeading[]; current: number | null }>();
const emit = defineEmits<{ opened: []; pick: [index: number] }>();
const { t } = useI18n();
const root = useTemplateRef<HTMLElement>("root");
const { open, close, toggle } = useDropdownMenu(root, () => emit("opened"));
const pick = (index: number): void => {
  close();
  emit("pick", index);
};
// Indented by level, so the list reads as the document's shape.
const INDENT_PX = 12;
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="files-outline-btn"
      class="flex h-[26px] cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-hover hover:text-fg"
      :class="open ? 'bg-selected text-fg' : 'bg-base text-secondary'"
      :aria-expanded="open"
      aria-controls="files-outline-list"
      :data-tip="t('fileOutline.tip')"
      @click="toggle"
    >
      <span class="material-symbols-outlined text-[14px]" aria-hidden="true">toc</span>{{ t("fileOutline.button") }}
    </button>
    <div
      v-if="open"
      id="files-outline-list"
      data-testid="files-outline"
      class="absolute right-0 top-[30px] z-20 max-h-[60vh] w-[300px] overflow-auto rounded-md border border-border bg-base p-1 text-[12px] shadow-lg"
    >
      <p v-if="headings.length === 0" class="px-2 py-1 text-secondary">{{ t("fileOutline.empty") }}</p>
      <button
        v-for="(heading, index) in headings"
        :key="`${heading.line}:${heading.text}`"
        type="button"
        data-testid="files-outline-heading"
        class="block w-full cursor-pointer truncate rounded py-1 pr-2 text-left hover:bg-hover"
        :class="index === current ? 'bg-selected text-fg' : 'text-secondary'"
        :style="{ paddingLeft: `${8 + (heading.level - 1) * INDENT_PX}px` }"
        :aria-current="index === current ? 'location' : undefined"
        @click="pick(index)"
      >
        {{ heading.text }}
      </button>
    </div>
  </div>
</template>
