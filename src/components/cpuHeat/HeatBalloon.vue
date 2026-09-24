<script setup lang="ts">
// A balloon that keeps inflating, wobbles, and pops.
import { computed, useId } from "vue";
import { HOT, type HeatPalette } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import HeatBurst from "./HeatBurst.vue";

const props = defineProps<{ level: StageLevel; palette: HeatPalette; animate: boolean }>();

const skinId = `heat-balloon-skin-${useId()}`;
const SIZE_BY_LEVEL: Record<StageLevel, number> = { 0: 0, 1: 0.6, 2: 0.72, 3: 0.86, 4: 1.02, 5: 1 };
const size = computed(() => SIZE_BY_LEVEL[props.level]);
const wobble = computed(() => (props.level === 4 ? "0.35s" : "1s"));
const SHREDS = [0, 40, 85, 130, 175, 220, 265, 310].map((angle, index) => ({
  angle,
  dx: Math.round(Math.cos((angle * Math.PI) / 180) * (70 + (index % 3) * 15)),
  dy: Math.round(Math.sin((angle * Math.PI) / 180) * (70 + (index % 3) * 15)),
}));
</script>

<template>
  <g>
    <g v-if="level === 5">
      <HeatBurst :x="100" :y="90" :scale="0.55" />
      <path v-for="shred in SHREDS" :key="shred.angle" d="M-6 -4 L6 -6 L3 6 Z" fill="#ff4d6d" :transform="`translate(100 90)`">
        <animateMotion :path="`M0 0 L${shred.dx} ${shred.dy + 40}`" dur="0.9s" fill="freeze" />
        <animate attributeName="opacity" values="1;1;0" dur="0.9s" fill="freeze" />
      </path>
    </g>
    <g v-else :transform="`translate(100 150) scale(${size}) translate(-100 -150)`">
      <defs>
        <radialGradient :id="skinId" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stop-color="#ffc2cf" />
          <stop offset="45%" stop-color="#ff4d6d" />
          <stop offset="100%" stop-color="#a3122f" />
        </radialGradient>
      </defs>
      <g>
        <animateTransform
          v-if="animate && level >= 3"
          attributeName="transform"
          type="rotate"
          values="-4 100 150;4 100 150;-4 100 150"
          :dur="wobble"
          repeatCount="indefinite"
        />
        <path d="M100 152 Q92 170 104 185 Q110 195 100 200" fill="none" :stroke="palette.ink" stroke-width="2" />
        <path d="M94 150 L106 150 L100 142 Z" fill="#a3122f" :stroke="palette.ink" stroke-width="2" />
        <ellipse cx="100" cy="88" rx="48" ry="58" :fill="`url(#${skinId})`" :stroke="palette.ink" stroke-width="2" />
        <ellipse cx="82" cy="62" rx="10" ry="16" fill="#ffffff" opacity="0.7" transform="rotate(25 82 62)" />
      </g>
      <circle v-if="level >= 4" cx="100" cy="88" r="62" fill="none" :stroke="HOT.red" stroke-width="3" opacity="0">
        <animate v-if="animate" attributeName="opacity" values="0;0.8;0" dur="0.35s" repeatCount="indefinite" />
      </circle>
    </g>
  </g>
</template>
