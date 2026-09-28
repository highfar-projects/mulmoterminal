<script setup lang="ts">
// The toolbar's grid-ordering control: a button that shows the current mode and opens a menu of all
// three, rather than a button that cycles through them — with three states, a cycle gives no way to
// see the choices or know what the next press does.
//
// Placement, keyboard and dismissal come from useAnchoredMenu.
import { computed, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import LauncherButton from "./LauncherButton.vue";
import { SORT_MODES, sortModeButton, sortModeIcon } from "./sortModeButton";
import { useAnchoredMenu } from "../composables/useAnchoredMenu";
import { ANCHORED_MENU_ITEM_CLASS, ANCHORED_MENU_PANEL_CLASS } from "./anchoredMenuClasses";
import type { SortMode } from "./gridTabs";

const props = defineProps<{ mode: SortMode }>();
const emit = defineEmits<{ select: [mode: SortMode] }>();

const { t } = useI18n();
const trigger = useTemplateRef<HTMLElement>("trigger");
const menu = useTemplateRef<HTMLElement>("menu");
// Opened from the keyboard or the pointer alike, focus lands on the current choice, so the arrow
// keys start from where the user already is.
const { open, pos, toggle, leave, onMenuKeydown } = useAnchoredMenu(trigger, menu, {
  itemSelector: '[role="menuitemradio"]',
  initialItem: (items) => items.find((el) => el.getAttribute("aria-checked") === "true"),
});

const button = computed(() => sortModeButton(props.mode));
const triggerLabel = computed(() => t("sortMenu.trigger", { mode: t(`sortMenu.modes.${props.mode}.label`) }));

function pick(mode: SortMode): void {
  emit("select", mode);
  leave();
}
</script>

<template>
  <span ref="trigger" class="inline-flex flex-none">
    <LauncherButton
      :icon="button.icon"
      :title="triggerLabel"
      :label="triggerLabel"
      :active="button.active"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    />
  </span>
  <Teleport to="body">
    <!-- `pointerdown.stop`: the menu lives outside the trigger, and the dropdown closes on any
         pointerdown it does not contain. -->
    <div
      v-if="open"
      ref="menu"
      data-testid="sort-mode-menu"
      role="menu"
      :aria-label="t('sortMenu.title')"
      :class="ANCHORED_MENU_PANEL_CLASS"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
      @pointerdown.stop
      @keydown="onMenuKeydown"
    >
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
    </div>
  </Teleport>
</template>
