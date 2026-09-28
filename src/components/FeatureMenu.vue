<script setup lang="ts">
// The toolbar's door to the grid's occasional features — Rooms, Blueprints, Worklog — as one menu
// rather than three glyph-only buttons, which were hard to tell apart and cost the row space even
// for features nobody uses. Placement, keyboard and dismissal come from useAnchoredMenu.
import { useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import LauncherButton from "./LauncherButton.vue";
import { FEATURE_MENU_ICONS, type FeatureMenuEntry } from "./featureMenuEntries";
import { useAnchoredMenu } from "../composables/useAnchoredMenu";
import { ANCHORED_MENU_ITEM_CLASS, ANCHORED_MENU_PANEL_CLASS } from "./anchoredMenuClasses";

defineProps<{ entries: FeatureMenuEntry[] }>();
const emit = defineEmits<{ select: [entry: FeatureMenuEntry] }>();

const { t } = useI18n();
const trigger = useTemplateRef<HTMLElement>("trigger");
const menu = useTemplateRef<HTMLElement>("menu");
const { open, pos, toggle, leave, onMenuKeydown } = useAnchoredMenu(trigger, menu, {
  itemSelector: '[role="menuitem"]',
  initialItem: (items) => items[0],
});

function pick(entry: FeatureMenuEntry): void {
  emit("select", entry);
  leave();
}
</script>

<template>
  <span ref="trigger" class="inline-flex flex-none">
    <LauncherButton
      icon="widgets"
      :title="t('featureMenu.trigger')"
      :label="t('featureMenu.trigger')"
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
      data-testid="feature-menu"
      role="menu"
      :aria-label="t('featureMenu.title')"
      :class="ANCHORED_MENU_PANEL_CLASS"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
      @pointerdown.stop
      @keydown="onMenuKeydown"
    >
      <button
        v-for="entry in entries"
        :key="entry"
        type="button"
        role="menuitem"
        :data-testid="`feature-menu-${entry}`"
        :class="ANCHORED_MENU_ITEM_CLASS"
        @click="pick(entry)"
      >
        <span class="material-symbols-outlined mt-px text-[16px] text-accent" aria-hidden="true">{{ FEATURE_MENU_ICONS[entry] }}</span>
        <span class="min-w-0 flex-auto">
          <span class="block text-[13px]">{{ t(`featureMenu.items.${entry}.label`) }}</span>
          <span class="block text-[11px] leading-snug text-dim">{{ t(`featureMenu.items.${entry}.detail`) }}</span>
        </span>
      </button>
    </div>
  </Teleport>
</template>
