<script setup lang="ts">
// A kettle: steam from the spout, the lid rattling, then the lid blown off in a cloud of steam.
import { computed, useId } from "vue";
import type { HeatPalette } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import HeatGlow from "./HeatGlow.vue";

const props = defineProps<{ level: StageLevel; palette: HeatPalette; animate: boolean }>();

const bodyId = `heat-kettle-body-${useId()}`;
const STEAM_BY_LEVEL: Record<StageLevel, number> = { 0: 0, 1: 0, 2: 2, 3: 3, 4: 5, 5: 0 };
const wisps = computed(() => Array.from({ length: STEAM_BY_LEVEL[props.level] }, (_, index) => ({ index, begin: `${index * 0.3}s` })));
const rattle = computed(() => (props.level === 4 ? "0.12s" : "0.3s"));
const CLOUDS = [
  { x: 180, y: 80, r: 34 },
  { x: 100, y: 70, r: 44 },
  { x: 60, y: 60, r: 30 },
  { x: 140, y: 40, r: 38 },
];
</script>

<template>
  <g>
    <defs>
      <radialGradient :id="bodyId" cx="40%" cy="35%" r="75%">
        <stop offset="0%" :stop-color="palette.bodyStops[0]" />
        <stop offset="50%" :stop-color="palette.bodyStops[1]" />
        <stop offset="100%" :stop-color="palette.bodyStops[2]" />
      </radialGradient>
    </defs>
    <HeatGlow v-if="level < 5" :x="100" :y="140" :r="90" :level="level" :animate="animate" />
    <path d="M58 104 Q100 30 142 104" fill="none" :stroke="palette.cap" stroke-width="7" stroke-linecap="round" />
    <path d="M140 125 L175 95 L184 101 L150 142 Z" :fill="`url(#${bodyId})`" :stroke="palette.ink" stroke-width="3" />
    <path d="M50 170 Q40 120 70 100 L130 100 Q160 120 150 170 Z" :fill="`url(#${bodyId})`" :stroke="palette.ink" stroke-width="3" />
    <rect x="45" y="168" width="110" height="10" rx="4" :fill="palette.cap" :stroke="palette.ink" stroke-width="2" />
    <ellipse cx="78" cy="125" rx="10" ry="16" :fill="palette.highlight" opacity="0.6" transform="rotate(20 78 125)" />
    <g>
      <animateTransform
        v-if="animate && level >= 3 && level < 5"
        attributeName="transform"
        type="translate"
        values="0 0;1 -4;-1 0;0 -3;0 0"
        :dur="rattle"
        repeatCount="indefinite"
      />
      <animateMotion v-if="level === 5" path="M0 0 Q30 -120 70 -190" dur="0.9s" fill="freeze" />
      <animateTransform v-if="level === 5" attributeName="transform" type="rotate" values="0 100 100;200 100 100" dur="0.9s" fill="freeze" />
      <ellipse cx="100" cy="100" rx="32" ry="7" :fill="palette.cap" :stroke="palette.ink" stroke-width="2" />
      <circle cx="100" cy="90" r="6" :fill="palette.cap" :stroke="palette.ink" stroke-width="2" />
    </g>
    <path
      v-for="wisp in wisps"
      :key="wisp.index"
      d="M182 90 q-8 -12 0 -24 q8 -12 0 -24"
      fill="none"
      :stroke="palette.smoke"
      stroke-width="5"
      stroke-linecap="round"
      opacity="0"
    >
      <animateTransform v-if="animate" attributeName="transform" type="translate" values="0 0;-6 -40" dur="1.2s" :begin="wisp.begin" repeatCount="indefinite" />
      <animate v-if="animate" attributeName="opacity" values="0.9;0" dur="1.2s" :begin="wisp.begin" repeatCount="indefinite" />
    </path>
    <g v-if="level === 5">
      <circle v-for="cloud in CLOUDS" :key="cloud.x" :cx="cloud.x" :cy="cloud.y" r="4" :fill="palette.smoke">
        <animate attributeName="r" :values="`4;${cloud.r}`" dur="0.8s" fill="freeze" />
        <animate attributeName="opacity" values="0.9;0" dur="1.6s" fill="freeze" />
      </circle>
    </g>
  </g>
</template>
