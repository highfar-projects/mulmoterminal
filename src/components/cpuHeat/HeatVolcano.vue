<script setup lang="ts">
// A volcano: smoke, then glowing lava running down its sides, then an eruption.
import { computed, useId } from "vue";
import { HOT, type HeatPalette } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import HeatGlow from "./HeatGlow.vue";
import HeatBurst from "./HeatBurst.vue";

const props = defineProps<{ level: StageLevel; palette: HeatPalette; animate: boolean }>();

const bodyId = `heat-volcano-body-${useId()}`;
const SMOKE_BY_LEVEL: Record<StageLevel, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 5, 5: 0 };
const puffs = computed(() =>
  Array.from({ length: SMOKE_BY_LEVEL[props.level] }, (_, index) => ({
    index,
    drift: (index % 2 === 0 ? -1 : 1) * (10 + index * 6),
    begin: `${index * 0.45}s`,
  })),
);
const FOUNTAIN = [-80, -55, -35, -18, 0, 16, 34, 52, 74, 90].map((dx, index) => ({
  dx,
  peak: -110 - (index % 3) * 25,
  r: 5 + (index % 3) * 2,
  color: [HOT.lava, HOT.orange, HOT.yellow][index % 3],
  dur: `${1 + (index % 4) * 0.15}s`,
}));
</script>

<template>
  <g>
    <defs>
      <linearGradient :id="bodyId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="palette.bodyStops[1]" />
        <stop offset="100%" :stop-color="palette.bodyStops[2]" />
      </linearGradient>
    </defs>
    <HeatGlow v-if="level < 5" :x="100" :y="70" :r="60" :level="level" :animate="animate" />
    <path d="M10 185 L78 78 Q100 70 122 78 L190 185 Z" :fill="`url(#${bodyId})`" :stroke="palette.ink" stroke-width="3" />
    <ellipse cx="100" cy="78" rx="22" ry="6" :fill="HOT.lava" :opacity="level >= 2 ? 1 : 0.4" />
    <g v-if="level >= 3 && level < 5" :stroke="HOT.lava" stroke-width="7" stroke-linecap="round" fill="none">
      <path d="M88 80 Q82 110 74 140" stroke-dasharray="70" stroke-dashoffset="70">
        <animate v-if="animate" attributeName="stroke-dashoffset" values="70;0" :dur="level === 4 ? '0.9s' : '1.6s'" repeatCount="indefinite" />
      </path>
      <path d="M112 80 Q120 105 130 125" stroke-dasharray="55" stroke-dashoffset="55">
        <animate v-if="animate" attributeName="stroke-dashoffset" values="55;0" :dur="level === 4 ? '0.7s' : '1.3s'" repeatCount="indefinite" />
      </path>
    </g>
    <circle v-for="puff in puffs" :key="puff.index" cx="100" cy="62" r="9" :fill="palette.smoke" opacity="0">
      <animateTransform
        v-if="animate"
        attributeName="transform"
        type="translate"
        :values="`0 0;${puff.drift} -55`"
        dur="1.8s"
        :begin="puff.begin"
        repeatCount="indefinite"
      />
      <animate v-if="animate" attributeName="r" values="8;22" dur="1.8s" :begin="puff.begin" repeatCount="indefinite" />
      <animate v-if="animate" attributeName="opacity" values="0.8;0" dur="1.8s" :begin="puff.begin" repeatCount="indefinite" />
    </circle>
    <g v-if="level === 5">
      <HeatBurst :x="100" :y="70" :scale="0.6" />
      <circle v-for="drop in FOUNTAIN" :key="drop.dx" cx="100" cy="75" :r="drop.r" :fill="drop.color">
        <animateMotion :path="`M0 0 Q${drop.dx / 2} ${drop.peak} ${drop.dx} 60`" :dur="drop.dur" fill="freeze" />
        <animate attributeName="opacity" values="1;1;0" :dur="drop.dur" fill="freeze" />
      </circle>
    </g>
  </g>
</template>
