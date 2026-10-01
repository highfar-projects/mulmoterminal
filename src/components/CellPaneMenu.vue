<script setup lang="ts">
// One icon on a cell's header that opens a menu of related views — the history ones, or the tool
// ones — instead of a row of look-alike glyphs. Each entry says what it is in a line, reads as
// checked while its pane is open (choosing it again hides it), and can be shown DISABLED with the
// reason, which is how a tiled cell offers panes that need the cell enlarged first.
//
// The frame — placement, keyboard and dismissal — is AnchoredMenu, like the toolbar's feature menu.
import { computed, useTemplateRef } from "vue";
import AnchoredMenu from "./AnchoredMenu.vue";
import type { AnchoredMenuInitialFocus } from "./anchoredMenuFocus";
import { ANCHORED_MENU_ITEM_CLASS, ANCHORED_MENU_PANEL_CLASS } from "./anchoredMenuClasses";
import { CELL_BTN, CELL_BTN_ACTIVE } from "./cellChromeClasses";
import type { CellPaneMenuEntry } from "./cellPaneMenuEntries";

const props = defineProps<{
  icon: string;
  label: string;
  testid: string;
  entries: CellPaneMenuEntry[];
}>();
// `opening` fires before the menu draws, so a parent can refresh what an entry depends on.
const emit = defineEmits<{ select: [id: CellPaneMenuEntry["id"]]; opening: [] }>();

const menu = useTemplateRef<InstanceType<typeof AnchoredMenu>>("menu");
const ITEM_SELECTOR = '[role^="menuitem"]:not(:disabled)';
// Open on the pane that is showing, so the one keypress most likely wanted — hide it — is Enter.
const INITIAL_FOCUS: AnchoredMenuInitialFocus = "checkedOrFirst";

// The trigger reads as pressed while one of its panes is open, as the buttons it replaces did.
const triggerClass = computed(() => (props.entries.some((entry) => entry.checked) ? CELL_BTN_ACTIVE : CELL_BTN));

function onTrigger(): void {
  if (!menu.value?.open) emit("opening");
  menu.value?.toggle();
}

function pick(entry: CellPaneMenuEntry): void {
  emit("select", entry.id);
  menu.value?.leave();
}
</script>

<template>
  <AnchoredMenu
    ref="menu"
    :item-selector="ITEM_SELECTOR"
    :initial-focus="INITIAL_FOCUS"
    :panel-class="ANCHORED_MENU_PANEL_CLASS"
    :testid="`${testid}-menu`"
    :label="label"
  >
    <template #trigger="{ open }">
      <button
        type="button"
        class="cell-btn"
        :class="triggerClass"
        :data-testid="testid"
        :data-tip="label"
        :aria-label="label"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="onTrigger"
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{ icon }}</span>
      </button>
    </template>
    <template v-for="entry in entries" :key="entry.id">
      <span v-if="entry.separated" class="mx-1 my-1 block h-px bg-border" aria-hidden="true" />
      <button
        type="button"
        :role="entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
        :aria-checked="entry.checked === undefined ? undefined : entry.checked"
        :disabled="entry.disabled"
        :data-testid="`cell-pane-menu-${entry.id}`"
        :class="[ANCHORED_MENU_ITEM_CLASS, 'disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent']"
        @click="pick(entry)"
      >
        <span class="material-symbols-outlined mt-px text-[16px] text-accent" aria-hidden="true">{{ entry.icon }}</span>
        <span class="min-w-0 flex-auto">
          <span class="block text-[13px]">{{ entry.label }}</span>
          <span class="block text-[11px] leading-snug text-dim">{{ entry.detail }}</span>
        </span>
        <span v-if="entry.checked" class="material-symbols-outlined mt-px text-[16px] text-accent" aria-hidden="true">check</span>
      </button>
    </template>
  </AnchoredMenu>
</template>
