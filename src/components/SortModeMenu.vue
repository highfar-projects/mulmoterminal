<script setup lang="ts">
// The toolbar's grid-ordering control: a button that shows the current mode and opens a menu of all
// three, rather than a button that cycles through them — with three states, a cycle gives no way to
// see the choices or know what the next press does.
//
// The menu is teleported to <body> and fixed-positioned because the button sits in the toolbar's
// horizontally scrolling nav, which would clip it.
import { computed, nextTick, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import LauncherButton from "./LauncherButton.vue";
import { SORT_MODES, sortModeButton, sortModeIcon } from "./sortModeButton";
import { fitMenu, type MenuPoint } from "./rowMenu";
import { useDropdownMenu } from "../composables/useDropdownMenu";
import type { SortMode } from "./gridTabs";

const props = defineProps<{ mode: SortMode }>();
const emit = defineEmits<{ select: [mode: SortMode] }>();

const { t } = useI18n();
const trigger = useTemplateRef<HTMLElement>("trigger");
const menu = useTemplateRef<HTMLElement>("menu");
const pos = ref<MenuPoint>({ top: 0, left: 0 });
const { open, close, toggle } = useDropdownMenu(trigger, () => void place());

const button = computed(() => sortModeButton(props.mode));
const triggerLabel = computed(() => t("sortMenu.trigger", { mode: t(`sortMenu.modes.${props.mode}.label`) }));

// Placed once it has rendered, since only then is its size known: right-aligned under the button,
// then pulled back inside the viewport.
async function place(): Promise<void> {
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect) return;
  pos.value = { top: rect.bottom + 4, left: rect.left };
  await nextTick();
  const box = menu.value?.getBoundingClientRect();
  if (box) pos.value = fitMenu(pos.value, box, { width: window.innerWidth, height: window.innerHeight });
}

function pick(mode: SortMode): void {
  emit("select", mode);
  close();
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
      class="fixed z-[60] w-72 rounded-lg border border-border bg-panel p-1.5 font-sans text-fg shadow-xl"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
      @pointerdown.stop
    >
      <button
        v-for="option in SORT_MODES"
        :key="option"
        type="button"
        role="menuitemradio"
        :aria-checked="option === mode"
        :data-testid="`sort-mode-${option}`"
        class="flex w-full cursor-pointer items-start gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-fg hover:bg-hover"
        :class="option === mode ? 'bg-selected' : ''"
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
