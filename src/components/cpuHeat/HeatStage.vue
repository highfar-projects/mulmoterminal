<script setup lang="ts">
// One picture at one heat level, in a 200x200 box. The shake and the fade-in are shared; what
// burns, and how it ends, is each picture's own.
import type { Component } from "vue";
import type { HeatPalette } from "./heatPalette";
import type { HeatPattern } from "../../../common/playfulEffects";
import type { StageLevel } from "./stageLevel";
import HeatBomb from "./HeatBomb.vue";
import HeatVolcano from "./HeatVolcano.vue";
import HeatKettle from "./HeatKettle.vue";
import HeatRocket from "./HeatRocket.vue";
import HeatDynamite from "./HeatDynamite.vue";
import HeatBalloon from "./HeatBalloon.vue";
import HeatSkull from "./HeatSkull.vue";

defineProps<{ pattern: HeatPattern; level: StageLevel; palette: HeatPalette; animate: boolean }>();

const PICTURE: Record<HeatPattern, Component> = {
  bomb: HeatBomb,
  volcano: HeatVolcano,
  kettle: HeatKettle,
  rocket: HeatRocket,
  dynamite: HeatDynamite,
  balloon: HeatBalloon,
  skull: HeatSkull,
};
const OPACITY: Record<StageLevel, number> = { 0: 0, 1: 0.35, 2: 0.5, 3: 0.6, 4: 0.7, 5: 1 };
</script>

<template>
  <svg viewBox="0 0 200 200" overflow="visible">
    <g>
      <animateTransform
        v-if="animate && level === 4"
        attributeName="transform"
        type="translate"
        values="0 0;-3 1;2 -2;-2 2;3 0;0 0"
        dur="0.18s"
        repeatCount="indefinite"
      />
      <g :opacity="OPACITY[level]">
        <component :is="PICTURE[pattern]" :level="level" :palette="palette" :animate="animate" />
      </g>
    </g>
  </svg>
</template>
