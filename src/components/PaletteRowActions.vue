<script setup lang="ts">
// The command palette's second panel (#2546): the actions on one row, picked with the arrows and
// Enter. The palette owns the keys and the state; this only draws the list it is given.
import { useI18n } from "vue-i18n";
import type { RowAction } from "../composables/paletteRowActions";

defineProps<{ actions: readonly RowAction[]; active: number; rowLabel: string }>();
const emit = defineEmits<{ pick: [index: number]; hover: [index: number] }>();
const { t } = useI18n();
</script>

<template>
  <div data-testid="command-palette-actions">
    <p class="truncate border-b border-border px-3 py-1.5 text-[11px] text-dim">{{ t("commandPalette.rowActions.title", { row: rowLabel }) }}</p>
    <ul role="listbox" class="py-1">
      <li
        v-for="(action, index) in actions"
        :id="`command-palette-action-${index}`"
        :key="action.id"
        :data-action-id="action.id"
        role="option"
        :aria-selected="index === active"
        :aria-disabled="action.disabledReason !== null"
        class="flex cursor-pointer items-center gap-3 px-3 py-1.5"
        :class="[index === active ? 'bg-hover' : '', action.disabledReason !== null ? 'cursor-default opacity-50' : '']"
        @pointerenter="emit('hover', index)"
        @click="emit('pick', index)"
      >
        <span class="material-symbols-outlined flex-none text-[18px] text-dim" aria-hidden="true">{{ action.icon }}</span>
        <span class="min-w-0 flex-auto">
          <span class="block truncate text-[13px] text-fg">{{ t(`commandPalette.rowActions.${action.id}`) }}</span>
          <span v-if="action.disabledReason" class="block truncate text-[11px] text-dim">{{ action.disabledReason }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
