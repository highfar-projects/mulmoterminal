<script setup lang="ts">
// A round bomb: the fuse lights, burns shorter, and the bomb goes off.
import { useId } from "vue";
import type { HeatPalette } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import HeatSpark from "./HeatSpark.vue";
import HeatBurst from "./HeatBurst.vue";
import HeatGlow from "./HeatGlow.vue";
import HeatSwell from "./HeatSwell.vue";

defineProps<{ level: StageLevel; palette: HeatPalette; animate: boolean }>();

const bodyId = `heat-bomb-body-${useId()}`;
</script>

<template>
  <g>
    <HeatBurst v-if="level === 5" :x="100" :y="110" :scale="1" />
    <g v-else>
      <HeatGlow :x="95" :y="118" :r="95" :level="level" :animate="animate" />
      <HeatSwell :x="95" :y="118" :level="level" :animate="animate">
        <defs>
          <radialGradient :id="bodyId" cx="38%" cy="35%" r="70%">
            <stop offset="0%" :stop-color="palette.bodyStops[0]" />
            <stop offset="45%" :stop-color="palette.bodyStops[1]" />
            <stop offset="100%" :stop-color="palette.bodyStops[2]" />
          </radialGradient>
        </defs>
        <path d="M121 56 L141 40 L156 58 L136 74 Z" :fill="palette.cap" :stroke="palette.ink" stroke-width="3" />
        <circle cx="95" cy="118" r="62" :fill="`url(#${bodyId})`" :stroke="palette.ink" stroke-width="4" />
        <ellipse cx="72" cy="92" rx="18" ry="10" :fill="palette.highlight" opacity="0.8" transform="rotate(-35 72 92)" />
        <path
          :d="level >= 3 ? 'M148 49 Q158 36 166 34' : 'M148 49 Q160 30 176 26 Q188 24 190 14'"
          fill="none"
          :stroke="palette.fuse"
          stroke-width="6"
          stroke-linecap="round"
        />
      </HeatSwell>
      <HeatSpark v-if="level >= 2" :x="level >= 3 ? 166 : 190" :y="level >= 3 ? 34 : 14" :big="level >= 3" :animate="animate" />
    </g>
  </g>
</template>
