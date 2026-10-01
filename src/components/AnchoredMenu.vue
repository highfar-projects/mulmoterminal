<script setup lang="ts">
// The frame the toolbar and header menus share: a trigger slot, and a panel teleported to <body>
// holding the items. Placement, keyboard and dismissal come from useAnchoredMenu; the trigger and
// the items are the caller's, so each menu keeps its own look and wording.
import { useTemplateRef } from "vue";
import { useAnchoredMenu } from "../composables/useAnchoredMenu";
import { initialMenuItem, type AnchoredMenuInitialFocus } from "./anchoredMenuFocus";

const props = defineProps<{
  itemSelector: string;
  initialFocus: AnchoredMenuInitialFocus;
  panelClass: string;
  testid: string;
  label?: string;
}>();

const trigger = useTemplateRef<HTMLElement>("trigger");
const menu = useTemplateRef<HTMLElement>("menu");
const { open, pos, toggle, close, leave, onMenuKeydown } = useAnchoredMenu(trigger, menu, {
  itemSelector: props.itemSelector,
  initialItem: (items) => initialMenuItem(props.initialFocus, items),
});

defineExpose({ open, toggle, close, leave });
</script>

<template>
  <span ref="trigger" class="inline-flex flex-none">
    <slot name="trigger" :open="open" :toggle="toggle" />
    <Teleport to="body">
      <!-- `pointerdown.stop`: the menu lives outside the trigger, and the dropdown closes on any
           pointerdown it does not contain. -->
      <div
        v-if="open"
        ref="menu"
        :data-testid="testid"
        role="menu"
        :aria-label="label"
        :class="panelClass"
        :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
        @pointerdown.stop
        @keydown="onMenuKeydown"
      >
        <slot />
      </div>
    </Teleport>
  </span>
</template>
