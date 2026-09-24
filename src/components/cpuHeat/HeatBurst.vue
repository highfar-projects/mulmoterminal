<script setup lang="ts">
// An explosion, played once where it is mounted: flash, fireball, shock ring, flying streaks.
import { HOT } from "./heatPalette";

const props = withDefaults(defineProps<{ x: number; y: number; scale: number; delaySeconds?: number }>(), { delaySeconds: 0 });

const begin = `${props.delaySeconds}s`;

const STREAK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
</script>

<template>
  <g :transform="`translate(${x} ${y}) scale(${scale}) translate(-100 -100)`" :visibility="delaySeconds > 0 ? 'hidden' : 'visible'">
    <set v-if="delaySeconds > 0" attributeName="visibility" to="visible" :begin="begin" fill="freeze" />
    <circle cx="100" cy="100" r="10" :fill="HOT.core">
      <animate attributeName="r" values="10;95" dur="0.5s" fill="freeze" :begin="begin" />
      <animate attributeName="opacity" values="1;0" dur="0.9s" fill="freeze" :begin="begin" />
    </circle>
    <circle cx="100" cy="100" r="8" :fill="HOT.orange">
      <animate attributeName="r" values="8;80" dur="0.7s" fill="freeze" :begin="begin" />
      <animate attributeName="opacity" values="1;0" dur="1.1s" fill="freeze" :begin="begin" />
    </circle>
    <circle cx="100" cy="100" r="6" fill="none" :stroke="HOT.red" stroke-width="6">
      <animate attributeName="r" values="6;98" dur="0.8s" fill="freeze" :begin="begin" />
      <animate attributeName="opacity" values="1;0" dur="1s" fill="freeze" :begin="begin" />
    </circle>
    <g :stroke="HOT.yellow" stroke-width="4" stroke-linecap="round">
      <line v-for="angle in STREAK_ANGLES" :key="angle" x1="100" y1="100" x2="100" y2="80" :transform="`rotate(${angle} 100 100)`">
        <animate attributeName="y2" values="80;8" dur="0.6s" fill="freeze" :begin="begin" />
        <animate attributeName="y1" values="100;30" dur="0.8s" fill="freeze" :begin="begin" />
        <animate attributeName="opacity" values="1;0" dur="1s" fill="freeze" :begin="begin" />
      </line>
    </g>
  </g>
</template>
