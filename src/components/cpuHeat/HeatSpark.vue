<script setup lang="ts">
// A lit fuse's tip: a flickering core with embers thrown off it.
import { useId } from "vue";
import { HOT } from "./heatPalette";

defineProps<{ x: number; y: number; big: boolean; animate: boolean }>();

const gradientId = `heat-spark-${useId()}`;
const EMBER_REACH = 34;
const EMBERS = [-70, -35, 0, 30, 65, 110, 150].map((angle, index) => ({
  angle,
  dx: Math.round(Math.cos((angle * Math.PI) / 180) * EMBER_REACH),
  dy: Math.round(Math.sin((angle * Math.PI) / 180) * EMBER_REACH),
  dur: `${0.35 + (index % 3) * 0.12}s`,
}));
</script>

<template>
  <g :transform="`translate(${x} ${y})`">
    <defs>
      <radialGradient :id="gradientId" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff7c2" />
        <stop offset="45%" stop-color="#ffc21f" />
        <stop offset="100%" stop-color="#ff4d00" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle r="16" :fill="`url(#${gradientId})`">
      <animate v-if="animate" attributeName="r" :values="big ? '14;26;12;22;14' : '10;16;9;14;10'" dur="0.45s" repeatCount="indefinite" />
    </circle>
    <circle r="5" fill="#ffffff">
      <animate v-if="animate" attributeName="opacity" values="1;0.4;1;0.6;1" dur="0.2s" repeatCount="indefinite" />
    </circle>
    <circle v-for="ember in EMBERS" :key="ember.angle" r="2.5" :fill="HOT.yellow">
      <animateTransform
        v-if="animate"
        attributeName="transform"
        type="translate"
        :values="`0 0;${ember.dx} ${ember.dy}`"
        :dur="ember.dur"
        repeatCount="indefinite"
      />
      <animate v-if="animate" attributeName="opacity" values="1;0" :dur="ember.dur" repeatCount="indefinite" />
    </circle>
  </g>
</template>
