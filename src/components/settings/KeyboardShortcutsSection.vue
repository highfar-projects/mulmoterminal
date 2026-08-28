<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { activeKeymap } from "../../composables/activeKeymap";
import { keymapRows, sendRows } from "../keymapLabels";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import type { BundledSkillName } from "../../../common/bundledSkills";

const emit = defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void }>();

const { t } = useI18n();

// Reactive, not a snapshot: /api/config is fetched asynchronously, so a modal opened before it
// lands would otherwise sit on "Not set" for every action until it is closed and reopened.
const shortcutRows = computed(() => keymapRows(activeKeymap.value));
const sendKeyRows = computed(() => sendRows(activeKeymap.value));
</script>

<template>
  <i18n-t keypath="settings.shortcuts.intro" tag="p" class="mb-3 mt-1.5 text-[12px] text-dim">
    <template #keymapKey><code>keymap</code></template>
    <template #guide>
      <a class="text-accent underline" href="https://receptron.github.io/mulmoterminal/guide/en/config.html#keymap" target="_blank" rel="noopener noreferrer">{{
        t("settings.shortcuts.guide")
      }}</a>
    </template>
  </i18n-t>
  <div class="flex flex-col gap-1" role="list" :aria-label="t('settings.shortcuts.list')">
    <div
      v-for="row in shortcutRows"
      :key="row.action"
      role="listitem"
      class="flex items-center gap-2 rounded-md border border-border bg-elevated px-2.5 py-1.5"
    >
      <span class="min-w-0 flex-1 truncate text-[12px] text-fg">{{ row.label }}</span>
      <code v-if="row.binding" class="shrink-0 rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">{{ row.binding }}</code>
      <span v-else class="shrink-0 text-[11px] text-muted">{{ t("settings.shortcuts.notSet") }}</span>
      <code class="shrink-0 font-mono text-[10px] text-muted">{{ row.action }}</code>
    </div>
    <!-- An action always has a row, bound or not, so an unbound one still says the action
         exists. `send` had no such row and vanished when nothing was bound — which is how someone
         looking for "why does Cmd+ArrowLeft do nothing" found no evidence the mechanism is even
         here, and read the source to find out (#1858). One row is the whole fix. -->
    <div
      v-if="sendKeyRows.length === 0"
      data-testid="send-none"
      role="listitem"
      class="flex items-center gap-2 rounded-md border border-border bg-elevated px-2.5 py-1.5"
    >
      <span class="min-w-0 flex-1 truncate text-[12px] text-fg">{{ t("settings.shortcuts.sendNone") }}</span>
      <span class="shrink-0 text-[11px] text-muted">{{ t("settings.shortcuts.notSet") }}</span>
      <code class="shrink-0 font-mono text-[10px] text-muted">send</code>
    </div>
    <div v-for="row in sendKeyRows" :key="row.id" role="listitem" class="flex items-center gap-2 rounded-md border border-border bg-elevated px-2.5 py-1.5">
      <i18n-t keypath="settings.shortcuts.sendRow" tag="span" class="min-w-0 flex-1 truncate text-[12px] text-fg">
        <template #key
          ><code class="font-mono text-[11px]">{{ row.label }}</code></template
        >
      </i18n-t>
      <code class="shrink-0 rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">{{ row.key }}</code>
      <code class="shrink-0 font-mono text-[10px] text-muted">send</code>
    </div>
  </div>
  <div class="mt-3">
    <SkillLaunchButton skill="mulmoterminal-keys" icon="keyboard" :label="t('settings.shortcuts.setUp')" @launch="emit('launch-skill', $event)" />
  </div>
</template>
