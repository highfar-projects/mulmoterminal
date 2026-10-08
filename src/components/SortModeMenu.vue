<script setup lang="ts">
// The toolbar's grid-ordering control: a button that shows the current mode and opens a menu of all
// three, rather than a button that cycles through them — with three states, a cycle gives no way to
// see the choices or know what the next press does.
//
// Placement, keyboard and dismissal come from AnchoredMenu.
import { computed, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import AnchoredMenu from "./AnchoredMenu.vue";
import type { AnchoredMenuInitialFocus } from "./anchoredMenuFocus";
import LauncherButton from "./LauncherButton.vue";
import { SORT_MODES, sortModeButton, sortModeIcon } from "./sortModeButton";
import { ANCHORED_MENU_ITEM_CLASS, ANCHORED_MENU_PANEL_CLASS } from "./anchoredMenuClasses";
import type { SortMode } from "./gridTabs";

const props = defineProps<{ mode: SortMode }>();
const emit = defineEmits<{ select: [mode: SortMode] }>();

const { t } = useI18n();
const menu = useTemplateRef<InstanceType<typeof AnchoredMenu>>("menu");
// Opened from the keyboard or the pointer alike, focus lands on the current choice, so the arrow
// keys start from where the user already is.
const INITIAL_FOCUS: AnchoredMenuInitialFocus = "checked";

const button = computed(() => sortModeButton(props.mode));
const triggerLabel = computed(() => t("sortMenu.trigger", { mode: t(`sortMenu.modes.${props.mode}.label`) }));

function pick(mode: SortMode): void {
  emit("select", mode);
  menu.value?.leave();
}
</script>

<template>
  <AnchoredMenu
    ref="menu"
    item-selector='[role="menuitemradio"]'
    :initial-focus="INITIAL_FOCUS"
    :panel-class="ANCHORED_MENU_PANEL_CLASS"
    testid="sort-mode-menu"
    :label="t('sortMenu.title')"
  >
    <template #trigger="{ open, toggle }">
      <LauncherButton
        :icon="button.icon"
        :title="triggerLabel"
        :label="triggerLabel"
        :active="button.active"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="toggle"
      />
    </template>
    <button
      v-for="option in SORT_MODES"
      :key="option"
      type="button"
      role="menuitemradio"
      :aria-checked="option === mode"
      :data-testid="`sort-mode-${option}`"
      :class="[ANCHORED_MENU_ITEM_CLASS, option === mode ? 'bg-selected' : '']"
      @click="pick(option)"
    >
      <span class="material-symbols-outlined mt-px text-[16px] text-accent" aria-hidden="true">{{ sortModeIcon(option) }}</span>
      <span class="min-w-0 flex-auto">
        <span class="block text-[13px]">{{ t(`sortMenu.modes.${option}.label`) }}</span>
        <span class="block text-[11px] leading-snug text-dim">{{ t(`sortMenu.modes.${option}.detail`) }}</span>
      </span>
      <span v-if="option === mode" class="material-symbols-outlined mt-px text-[16px] text-accent" aria-hidden="true">check</span>
    </button>
  </AnchoredMenu>
</template>
