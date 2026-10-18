<script setup lang="ts">
// The open files as tabs (#2267), following the collection chat's strip: a row under the header,
// small tabs, the front one in the selected colour. Each tab and its close button are siblings inside
// one pill, because a button cannot hold a button.
import { useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import type { TabStrip } from "./filesTabs";

const props = defineProps<{ strip: TabStrip; labels: string[]; focusablePath: string | null; openPath: string | null; dirty: boolean }>();
const emit = defineEmits<{ open: [path: string]; close: [path: string]; key: [event: KeyboardEvent, index: number] }>();

const { t } = useI18n();
const stripEl = useTemplateRef<HTMLElement>("stripEl");

/** The front tab's button, for the pane to put the keyboard on after a tab move. */
function frontTab(): HTMLElement | undefined {
  const front = props.strip.tabs.findIndex((entry) => entry.path === props.strip.activePath);
  return stripEl.value?.querySelectorAll<HTMLElement>('[role="tab"]')[front];
}
defineExpose({ frontTab });
</script>

<template>
  <div
    ref="stripEl"
    data-testid="files-tabs"
    role="tablist"
    class="flex flex-none items-center gap-1 overflow-x-auto border-b border-border px-2 py-1 font-sans text-[12px] text-dim"
    :aria-label="t('tips.panes.fileTabs')"
  >
    <div
      v-for="(tab, index) in strip.tabs"
      :key="tab.path"
      role="presentation"
      class="flex flex-none items-center rounded"
      :class="tab.path === strip.activePath ? 'bg-selected text-fg' : 'text-dim hover:text-fg'"
      @mousedown.middle.prevent
      @auxclick.middle="emit('close', tab.path)"
    >
      <button
        type="button"
        role="tab"
        data-testid="files-tab"
        :data-path="tab.path"
        :aria-selected="tab.path === strip.activePath"
        :tabindex="tab.path === focusablePath ? 0 : -1"
        :data-tip="tab.path"
        class="flex cursor-pointer items-center gap-1 border-0 bg-transparent py-0.5 pl-2 pr-1 font-mono text-[12px] text-inherit"
        @click="emit('open', tab.path)"
        @keydown="emit('key', $event, index)"
      >
        {{ labels[index]
        }}<span v-if="tab.path === openPath && dirty" class="text-amber"
          ><span aria-hidden="true">●</span><span class="sr-only">{{ t("tips.panes.unsaved") }}</span></span
        >
      </button>
      <button
        type="button"
        tabindex="-1"
        data-testid="files-tab-close"
        class="mr-0.5 flex cursor-pointer items-center rounded border-0 bg-transparent p-0 text-[13px] leading-none text-inherit hover:bg-hover"
        :data-tip="t('tips.panes.closeTab')"
        :aria-label="t('tips.panes.closeTabNamed', { name: labels[index] })"
        @click="emit('close', tab.path)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>
  </div>
</template>
