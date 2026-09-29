<script setup lang="ts">
// The top bar's search box (#2569), for those who switch it on: it looks like a field and opens the
// command palette, where the typing happens. A button underneath, so Enter and Space open it too.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { openCommandPalette } from "../composables/commandPalette";
import { activeKeymap } from "../composables/activeKeymap";

const { t } = useI18n();
const binding = computed((): string | null => {
  const bound = activeKeymap.value["command-palette"];
  return typeof bound === "string" ? bound : null;
});
</script>

<template>
  <button
    type="button"
    data-testid="palette-search-box"
    class="inline-flex h-7 w-full min-w-0 max-w-[420px] cursor-text items-center gap-2 rounded-md border border-border bg-input px-2.5 text-[12px] text-dim hover:border-accent"
    :aria-label="t('commandPalette.open')"
    @click="openCommandPalette"
  >
    <span class="material-symbols-outlined flex-none text-[16px]" aria-hidden="true">search</span>
    <span class="min-w-0 flex-auto truncate text-left">{{ t("commandPalette.searchBoxPlaceholder") }}</span>
    <code v-if="binding" class="flex-none rounded border border-border bg-subtle px-1 font-mono text-[11px] text-fg">{{ binding }}</code>
  </button>
</template>
