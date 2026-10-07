<script setup lang="ts">
// One rikishi in his own space (feet at the origin, facing right); the caller places and mirrors him.
import { useId } from "vue";
import type { HeatPalette } from "./heatPalette";
import { ARM_PATHS, BODY_TRANSFORM, type SumoPose } from "./sumoPose";

defineProps<{ pose: SumoPose; palette: HeatPalette; mawashi: string; fierce: boolean }>();

const skinId = `heat-sumo-skin-${useId()}`;
const SAGARI_X = [-12, -6, 0, 6, 12];
</script>

<template>
  <g :transform="BODY_TRANSFORM[pose]">
    <defs>
      <radialGradient :id="skinId" cx="40%" cy="35%" r="75%">
        <stop offset="0%" :stop-color="palette.bodyStops[0]" />
        <stop offset="50%" :stop-color="palette.bodyStops[1]" />
        <stop offset="100%" :stop-color="palette.bodyStops[2]" />
      </radialGradient>
    </defs>
    <rect x="-22" y="-22" width="17" height="22" rx="8" :fill="`url(#${skinId})`" :stroke="palette.ink" stroke-width="2.5" />
    <rect x="5" y="-22" width="17" height="22" rx="8" :fill="`url(#${skinId})`" :stroke="palette.ink" stroke-width="2.5" />
    <ellipse cx="0" cy="-42" rx="26" ry="27" :fill="`url(#${skinId})`" :stroke="palette.ink" stroke-width="2.5" />
    <path d="M-26 -32 Q0 -18 26 -32 L25 -20 Q0 -6 -25 -20 Z" :fill="mawashi" :stroke="palette.ink" stroke-width="2" />
    <line v-for="x in SAGARI_X" :key="x" :x1="x" y1="-14" :x2="x" y2="-3" :stroke="mawashi" stroke-width="2.5" stroke-linecap="round" />
    <g v-for="arm in ARM_PATHS[pose]" :key="arm" fill="none" stroke-linecap="round">
      <path :d="arm" :stroke="palette.ink" stroke-width="13" />
      <path :d="arm" :stroke="palette.bodyStops[1]" stroke-width="9" />
    </g>
    <circle cx="6" cy="-76" r="13" :fill="`url(#${skinId})`" :stroke="palette.ink" stroke-width="2.5" />
    <path d="M-5 -88 Q-2 -96 6 -92 Q4 -86 -5 -88 Z" :fill="palette.ink" />
    <path d="M10 -78 L17 -77" :stroke="palette.ink" stroke-width="2.5" stroke-linecap="round" />
    <path v-if="fierce" d="M8 -83 L18 -79" :stroke="palette.ink" stroke-width="2.5" stroke-linecap="round" />
    <path d="M12 -69 Q15 -67 18 -70" fill="none" :stroke="palette.ink" stroke-width="2" stroke-linecap="round" />
  </g>
</template>
