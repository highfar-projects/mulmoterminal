<script setup lang="ts">
// One picture at one heat level, in a 200x200 box. The shake and the fade-in are shared; what
// burns, and how it ends, is each picture's own.
import type { Component } from "vue";
import type { HeatPattern } from "../../../common/playfulEffects";
import { STAGE_OPACITY } from "./stageLevel";
import type { HeatFigureProps } from "./heatFigure";
import HeatBomb from "./HeatBomb.vue";
import HeatVolcano from "./HeatVolcano.vue";
import HeatKettle from "./HeatKettle.vue";
import HeatRocket from "./HeatRocket.vue";
import HeatDynamite from "./HeatDynamite.vue";
import HeatBalloon from "./HeatBalloon.vue";
import HeatSkull from "./HeatSkull.vue";
import HeatSumo from "./HeatSumo.vue";
import HeatUfo from "./HeatUfo.vue";

defineProps<{ pattern: HeatPattern } & HeatFigureProps>();

const PICTURE: Record<HeatPattern, Component> = {
  bomb: HeatBomb,
  volcano: HeatVolcano,
  kettle: HeatKettle,
  rocket: HeatRocket,
  dynamite: HeatDynamite,
  balloon: HeatBalloon,
  skull: HeatSkull,
  sumo: HeatSumo,
  ufo: HeatUfo,
};
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
      <g :opacity="STAGE_OPACITY[level]">
        <component :is="PICTURE[pattern]" :level="level" :palette="palette" :animate="animate" />
      </g>
    </g>
  </svg>
</template>
