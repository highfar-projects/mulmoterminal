<script setup lang="ts">
import type { NumberedLine } from "./searchResultView";

defineProps<{ lines: NumberedLine[] }>();
</script>

<template>
  <div aria-hidden="true">
    <div v-for="line in lines" :key="line.line" class="flex items-baseline gap-2 text-dim">
      <span class="w-10 flex-none text-right text-[11px] tabular-nums">{{ line.line }}</span>
      <span class="min-w-0 truncate">{{ line.text }}<span v-if="line.clipped"> …</span></span>
    </div>
  </div>
</template>
