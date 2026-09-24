<script setup lang="ts">
// A rocket on the pad: the engine lights, roars, and on the finale the rocket leaves.
import { computed } from "vue";
import { HOT, type HeatPalette } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import HeatGlow from "./HeatGlow.vue";

const props = defineProps<{ level: StageLevel; palette: HeatPalette; animate: boolean }>();

const FLAME_BY_LEVEL: Record<StageLevel, number> = { 0: 0, 1: 0, 2: 16, 3: 28, 4: 38, 5: 60 };
const flame = computed(() => FLAME_BY_LEVEL[props.level]);
const flamePath = (length: number, width: number): string => `M${100 - width} 158 Q100 ${158 + length * 2} ${100 + width} 158 Z`;
const outerFlame = computed(() => `${flamePath(flame.value, 14)};${flamePath(flame.value * 0.75, 12)};${flamePath(flame.value, 14)}`);
const innerFlame = computed(() => `${flamePath(flame.value * 0.6, 7)};${flamePath(flame.value * 0.45, 6)};${flamePath(flame.value * 0.6, 7)}`);
const PAD_SMOKE = [
  { x: 62, y: 188, r: 22 },
  { x: 138, y: 188, r: 22 },
  { x: 40, y: 192, r: 16 },
  { x: 160, y: 192, r: 16 },
];
</script>

<template>
  <g>
    <HeatGlow v-if="level < 5" :x="100" :y="175" :r="70" :level="level" :animate="animate" />
    <g v-if="level >= 3">
      <circle v-for="puff in PAD_SMOKE" :key="puff.x" :cx="puff.x" :cy="puff.y" :r="puff.r * 0.6" :fill="palette.smoke" opacity="0.7">
        <animate v-if="animate" attributeName="r" :values="`${puff.r * 0.5};${puff.r};${puff.r * 0.5}`" dur="1.1s" repeatCount="indefinite" />
      </circle>
    </g>
    <g>
      <animateTransform
        v-if="level === 5"
        attributeName="transform"
        type="translate"
        values="0 0;0 -260"
        dur="1.3s"
        calcMode="spline"
        keySplines="0.6 0 1 1"
        fill="freeze"
      />
      <g v-if="level >= 2">
        <path :d="flamePath(flame, 14)" :fill="HOT.orange">
          <animate v-if="animate" attributeName="d" :values="outerFlame" dur="0.15s" repeatCount="indefinite" />
        </path>
        <path :d="flamePath(flame * 0.6, 7)" :fill="HOT.yellow">
          <animate v-if="animate" attributeName="d" :values="innerFlame" dur="0.12s" repeatCount="indefinite" />
        </path>
      </g>
      <path d="M75 120 L52 158 L75 150 Z" :fill="HOT.red" :stroke="palette.ink" stroke-width="2" />
      <path d="M125 120 L148 158 L125 150 Z" :fill="HOT.red" :stroke="palette.ink" stroke-width="2" />
      <path d="M100 25 Q125 55 125 100 L125 150 L75 150 L75 100 Q75 55 100 25 Z" :fill="palette.metal" :stroke="palette.ink" stroke-width="3" />
      <path d="M100 25 Q116 44 121 62 L79 62 Q84 44 100 25 Z" :fill="HOT.red" :stroke="palette.ink" stroke-width="2" />
      <circle cx="100" cy="92" r="12" :fill="palette.highlight" :stroke="palette.ink" stroke-width="4" />
      <rect x="85" y="150" width="30" height="8" :fill="palette.cap" :stroke="palette.ink" stroke-width="2" />
    </g>
  </g>
</template>
