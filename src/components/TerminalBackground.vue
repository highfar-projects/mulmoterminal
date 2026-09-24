<script setup lang="ts">
// A directory's picture behind its terminal (`backgroundImage` in .mulmoterminal.json), faint the way
// Eterm's were. Drawn OVER the body with the blend that keeps text readable (useAppearance.ts)
// rather than behind a transparent xterm canvas, which xterm only offers at a cost to every cell.
// An <img>, not a CSS url(): nothing from the config file is ever spliced into a style.
import { computed } from "vue";
import type { PublicDirBackground } from "../../common/dirBackground";
import { READABLE_BLEND, useAppearance } from "../composables/useAppearance";

const props = defineProps<{ background: PublicDirBackground | null }>();

const appearance = useAppearance();
const FIT_CLASS = { cover: "object-cover", contain: "object-contain" } as const;
const fitClass = computed(() => (props.background ? FIT_CLASS[props.background.fit] : ""));
</script>

<template>
  <!-- The box takes its top from the caller (below the header row); the picture fills it. An <img>
       positioned by top and bottom alone would keep its own height instead of stretching. -->
  <div v-if="background" class="pointer-events-none absolute inset-x-0 bottom-0 z-10 overflow-hidden" :class="READABLE_BLEND[appearance]" aria-hidden="true">
    <img
      :src="background.url"
      alt=""
      draggable="false"
      data-testid="terminal-background"
      class="h-full w-full select-none"
      :class="fitClass"
      :style="{ opacity: background.opacity }"
    />
  </div>
</template>
