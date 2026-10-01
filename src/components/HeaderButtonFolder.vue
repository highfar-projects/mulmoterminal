<script setup lang="ts">
// A `buttons` folder: one row-2 icon that opens a menu of the buttons it holds, each with its label
// written out — in a menu there is room for the words the row itself cannot afford. Picking one is
// handed back to Terminal.vue, which runs it exactly as it runs a top-level button.
import { useTemplateRef } from "vue";
import AnchoredMenu from "./AnchoredMenu.vue";
import HeaderButtonGlyph from "./HeaderButtonGlyph.vue";
import type { HeaderButton, HeaderFolder } from "../composables/useHeaderButtons";
import { ANCHORED_MENU_ITEM_CLASS, ANCHORED_MENU_PANEL_CLASS } from "./anchoredMenuClasses";
import { HEADER_BUTTON_CLASS } from "./headerButtonClasses";

defineProps<{ folder: HeaderFolder }>();
const emit = defineEmits<{ pick: [button: HeaderButton] }>();

const menu = useTemplateRef<InstanceType<typeof AnchoredMenu>>("menu");

function pick(button: HeaderButton): void {
  menu.value?.leave();
  emit("pick", button);
}
</script>

<template>
  <AnchoredMenu
    ref="menu"
    item-selector='[role="menuitem"]'
    initial-focus="first"
    :panel-class="ANCHORED_MENU_PANEL_CLASS"
    testid="header-folder-menu"
    :label="folder.label"
  >
    <template #trigger="{ open, toggle }">
      <button
        type="button"
        :class="HEADER_BUTTON_CLASS"
        :data-tip="folder.label"
        :aria-label="folder.label"
        aria-haspopup="menu"
        :aria-expanded="open"
        data-testid="header-folder"
        @click="toggle"
      >
        <HeaderButtonGlyph :emoji="folder.emoji" :icon="folder.icon" />
      </button>
    </template>
    <button
      v-for="button in folder.items"
      :key="button.id"
      type="button"
      role="menuitem"
      :data-testid="`header-folder-item-${button.id}`"
      :class="[ANCHORED_MENU_ITEM_CLASS, 'items-center']"
      @click="pick(button)"
    >
      <span class="inline-flex w-[20px] flex-none justify-center text-muted"><HeaderButtonGlyph :emoji="button.emoji" :icon="button.icon" /></span>
      <span class="min-w-0 flex-auto text-[13px]">{{ button.label }}</span>
    </button>
  </AnchoredMenu>
</template>
