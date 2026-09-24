<script setup lang="ts">
// A skull, as the danger sign: its eyes light red, the jaw chatters, and it cracks and crumbles.
import { computed } from "vue";
import { HOT, type HeatPalette } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import HeatGlow from "./HeatGlow.vue";

const props = defineProps<{ level: StageLevel; palette: HeatPalette; animate: boolean }>();

const chatter = computed(() => (props.level === 4 ? "0.15s" : "0.4s"));
const TEETH = [80, 90, 100, 110, 120];
const EYES = [78, 122];
const DUST = [
  { x: 60, y: 120 },
  { x: 140, y: 120 },
  { x: 100, y: 60 },
  { x: 80, y: 170 },
  { x: 120, y: 170 },
];
</script>

<template>
  <g>
    <HeatGlow v-if="level < 5" :x="100" :y="100" :r="95" :level="level" :animate="animate" />
    <g>
      <animateTransform v-if="level === 5" attributeName="transform" type="translate" values="0 0;0 0;0 70" keyTimes="0;0.4;1" dur="1.2s" fill="freeze" />
      <animate v-if="level === 5" attributeName="opacity" values="1;1;0" keyTimes="0;0.4;1" dur="1.2s" fill="freeze" />
      <path
        d="M100 30 C55 30 40 65 42 95 C43 118 55 130 62 138 L62 150 L138 150 L138 138 C145 130 157 118 158 95 C160 65 145 30 100 30 Z"
        :fill="palette.bone"
        :stroke="palette.ink"
        stroke-width="3"
      />
      <ellipse v-for="x in EYES" :key="x" :cx="x" cy="98" rx="15" ry="17" :fill="palette.hole" />
      <path d="M100 112 L92 128 L108 128 Z" :fill="palette.hole" />
      <line v-for="x in TEETH" :key="`upper-${x}`" :x1="x" y1="138" :x2="x" y2="150" :stroke="palette.ink" stroke-width="2" />
      <g v-if="level >= 2 && level < 5">
        <circle v-for="x in EYES" :key="`glow-${x}`" :cx="x" cy="98" r="7" :fill="HOT.red">
          <animate v-if="animate" attributeName="opacity" values="1;0.35;1;0.7;1" :dur="level === 4 ? '0.25s' : '0.8s'" repeatCount="indefinite" />
          <animate v-if="animate && level >= 3" attributeName="r" values="6;10;6" dur="0.9s" repeatCount="indefinite" />
        </circle>
      </g>
      <g>
        <animateTransform
          v-if="animate && level >= 3 && level < 5"
          attributeName="transform"
          type="translate"
          values="0 0;0 7;0 0"
          :dur="chatter"
          repeatCount="indefinite"
        />
        <rect x="66" y="152" width="68" height="24" rx="8" :fill="palette.bone" :stroke="palette.ink" stroke-width="3" />
        <line v-for="x in TEETH" :key="`lower-${x}`" :x1="x" y1="152" :x2="x" y2="164" :stroke="palette.ink" stroke-width="2" />
      </g>
      <path
        v-if="level === 5"
        d="M100 30 L94 55 L106 72 L96 95 L104 112"
        fill="none"
        :stroke="palette.ink"
        stroke-width="3"
        stroke-dasharray="100"
        stroke-dashoffset="100"
      >
        <animate attributeName="stroke-dashoffset" values="100;0" dur="0.35s" fill="freeze" />
      </path>
    </g>
    <g v-if="level === 5">
      <circle v-for="dust in DUST" :key="`${dust.x}-${dust.y}`" :cx="dust.x" :cy="dust.y" r="3" :fill="palette.smoke">
        <animate attributeName="r" values="3;24" begin="0.45s" dur="0.9s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.8;0" begin="0.45s" dur="1.1s" fill="freeze" />
      </circle>
    </g>
  </g>
</template>
