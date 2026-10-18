<script setup lang="ts">
// The tree's row menu. Teleported and fixed-positioned for CockpitRowMenu's reason — the tree
// scrolls inside an overflow container, which would clip a panel left in place.
import { useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import type { FilesRowAction } from "./filesRowActions";
import type { OpenRowMenu } from "../composables/useFilesRowMenu";

defineProps<{ menu: OpenRowMenu | null }>();
const emit = defineEmits<{ nav: [event: KeyboardEvent]; pick: [action: FilesRowAction] }>();

const { t } = useI18n();
const el = useTemplateRef<HTMLElement>("el");
defineExpose({ el });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menu"
      ref="el"
      data-testid="files-row-menu"
      role="menu"
      class="fixed z-[60] min-w-[200px] rounded-lg border border-border bg-panel p-1.5 text-fg shadow-xl"
      :style="{ top: `${menu.top}px`, left: `${menu.left}px` }"
      @keydown="emit('nav', $event)"
    >
      <button
        v-for="action in menu.actions"
        :key="action.id"
        type="button"
        role="menuitem"
        :data-testid="`files-row-action-${action.id}`"
        class="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] text-secondary hover:bg-hover hover:text-fg"
        @click="emit('pick', action)"
      >
        <span class="material-symbols-outlined text-[15px]" aria-hidden="true">{{ action.icon }}</span> {{ t(action.labelKey) }}
      </button>
    </div>
  </Teleport>
</template>
