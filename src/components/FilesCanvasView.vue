<script setup lang="ts">
// One file's card, drawn by the plugin view the Canvas uses, inside the Files pane (#3008). Measured
// like the Canvas's own scroll box, because the fixed-height views size to `--canvas-card-h`.
import { computed, ref, watch } from "vue";
import { getPlugin } from "../plugins-registry";
import PluginFrame from "./PluginFrame.vue";
import { useCanvasCardHeight } from "../composables/useCanvasCardHeight";
import type { FilesCanvasResult } from "../composables/useFilesCanvasMode";
import { storyWatchChannel } from "../composables/storyWatchChannel";
import { usePubSub } from "../composables/usePubSub";

// Null while the card is being built — a story is a round trip to the server.
const props = defineProps<{ card: FilesCanvasResult | null }>();
const emit = defineEmits<{ updateResult: [update: Partial<FilesCanvasResult>] }>();

const plugin = computed(() => (props.card ? getPlugin(props.card.toolName) : undefined));
const box = ref<HTMLElement | null>(null);
useCanvasCardHeight(box);

// While a story is shown, its file's channel is held open: that is the server's cue to watch the
// file and tell the View when something other than the plugin rewrites it (#3014). The messages
// themselves go to the View on the plugin's own channel, so nothing is done with them here.
const { subscribe } = usePubSub();
watch(
  () => storyWatchChannel(props.card),
  (channel, _previous, onCleanup) => {
    if (channel) onCleanup(subscribe(channel, () => {}));
  },
  { immediate: true },
);

// None of the views a file can open in asks the host to send text (markdown, html, MulmoScript), and
// a Files pane has no conversation of its own to send it to.
const noConversation = (): boolean => false;
</script>

<template>
  <div ref="box" data-testid="files-canvas-view" class="min-w-0 flex-auto overflow-y-auto p-3">
    <p v-if="!card" data-testid="files-canvas-loading" class="p-4 text-[13px] text-muted">Loading…</p>
    <PluginFrame v-else-if="plugin" :key="card.uuid" :css="plugin.css" :height="plugin.height">
      <component
        :is="plugin.viewComponent"
        :selected-result="card"
        :send-text-message="noConversation"
        @update-result="(update: Partial<FilesCanvasResult>) => emit('updateResult', update)"
      />
    </PluginFrame>
  </div>
</template>
