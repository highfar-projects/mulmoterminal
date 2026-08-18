<script setup lang="ts">
// This machine's load, beside the 5h / 7d usage gauges (#1786). Same shape as those on purpose:
// they answer the same kind of question — what is nearly used up — and a reader scanning the
// header should not have to change how they read halfway along it.
import { computed, onMounted, onUnmounted } from "vue";
import { useMachineLoad } from "../composables/useMachineLoad";
import { machineLoadReadout, type LoadTone } from "../composables/machineLoadGauge";

const { load, start, stop } = useMachineLoad();
onMounted(start);
onUnmounted(stop);

const view = computed(() => machineLoadReadout(load.value));

const TONE_CLASS: Record<LoadTone, string> = {
  muted: "text-muted",
  amber: "text-amber",
  err: "text-err-text",
};
</script>

<template>
  <!-- Nothing at all until the host reports one: Windows keeps no load average, and 0% would say
       the machine is idle at the moment we cannot see it. -->
  <span
    v-if="view"
    class="ml-1.5 inline-flex flex-none items-center border-l border-border pl-2.5 font-mono text-[12px] leading-none"
    :class="TONE_CLASS[view.tone]"
    role="img"
    :aria-label="view.title"
    :title="view.title"
    data-testid="machine-load"
    >load {{ view.percent }}%</span
  >
</template>
