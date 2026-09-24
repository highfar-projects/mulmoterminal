<script setup lang="ts">
// The heat haze behind a picture: absent until lit, then stronger and throbbing as it heats up.
import { computed, useId } from "vue";
import { HOT } from "./heatPalette";
import type { StageLevel } from "./stageLevel";

const props = defineProps<{ x: number; y: number; r: number; level: StageLevel; animate: boolean }>();

const GLOW_OPACITY: Record<StageLevel, number> = { 0: 0, 1: 0, 2: 0.25, 3: 0.5, 4: 0.8, 5: 0 };
const gradientId = `heat-glow-${useId()}`;
const peak = computed(() => GLOW_OPACITY[props.level]);
</script>

<template>
  <g v-if="peak > 0">
    <defs>
      <radialGradient :id="gradientId" cx="50%" cy="50%" r="50%">
        <stop offset="0%" :stop-color="HOT.lava" />
        <stop offset="100%" :stop-color="HOT.lava" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle :cx="x" :cy="y" :r="r" :fill="`url(#${gradientId})`" :opacity="peak">
      <animate v-if="animate && level >= 3" attributeName="opacity" :values="`${peak * 0.5};${peak};${peak * 0.5}`" dur="0.9s" repeatCount="indefinite" />
    </circle>
  </g>
</template>
