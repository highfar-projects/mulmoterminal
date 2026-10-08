<script setup lang="ts">
// A flying saucer: it hovers and bobs at the low levels, beams down and rocks harder as the load
// climbs, runs red at the top, and on the finale shoots off into the sky.
import { computed, useId } from "vue";
import { HOT } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import type { HeatFigureProps } from "./heatFigure";
import HeatGlow from "./HeatGlow.vue";

const props = defineProps<HeatFigureProps>();

const BOB_VALUES = "0 0;0 -5;0 0";
const ALIEN_GREEN = "#8be28b";
const SAUCER_CENTER = { x: 100, y: 98 };
const BEAM_TOP_HALF_WIDTH = 12;
const BEAM_BOTTOM_Y = 190;

const BEAM_HALF_WIDTH_BY_LEVEL: Record<StageLevel, number> = { 0: 0, 1: 0, 2: 26, 3: 36, 4: 46, 5: 0 };
const BOB_SECONDS_BY_LEVEL: Record<StageLevel, number> = { 0: 2.4, 1: 2.4, 2: 1.8, 3: 1, 4: 0.4, 5: 1 };
const ROCK_DEGREES_BY_LEVEL: Record<StageLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 3, 4: 9, 5: 0 };
const BLINK_SECONDS_BY_LEVEL: Record<StageLevel, number> = { 0: 1.2, 1: 1.2, 2: 0.9, 3: 0.5, 4: 0.2, 5: 0.5 };

const RIM_LIGHTS = [
  { x: 62, y: 100 },
  { x: 81, y: 107 },
  { x: 100, y: 109 },
  { x: 119, y: 107 },
  { x: 138, y: 100 },
];
const ENGINE_SMOKE = [
  { x: 78, y: 62 },
  { x: 124, y: 58 },
];

const beamId = `heat-ufo-beam-${useId()}`;
const beamHalfWidth = computed(() => BEAM_HALF_WIDTH_BY_LEVEL[props.level]);
const beamPoints = computed(() => {
  const bottom = beamHalfWidth.value;
  const { x } = SAUCER_CENTER;
  return `${x - BEAM_TOP_HALF_WIDTH},${SAUCER_CENTER.y + 8} ${x + BEAM_TOP_HALF_WIDTH},${SAUCER_CENTER.y + 8} ${x + bottom},${BEAM_BOTTOM_Y} ${x - bottom},${BEAM_BOTTOM_Y}`;
});
const rockDegrees = computed(() => ROCK_DEGREES_BY_LEVEL[props.level]);
const rockValues = computed(() => {
  const { x, y } = SAUCER_CENTER;
  return `${-rockDegrees.value} ${x} ${y};${rockDegrees.value} ${x} ${y};${-rockDegrees.value} ${x} ${y}`;
});
const lightColor = computed(() => (props.level === 4 ? HOT.red : HOT.yellow));
</script>

<template>
  <g>
    <HeatGlow v-if="level < 5" :x="100" :y="100" :r="75" :level="level" :animate="animate" />
    <g>
      <animateTransform
        v-if="level === 5"
        attributeName="transform"
        type="translate"
        values="0 0;190 -230"
        dur="1.1s"
        calcMode="spline"
        keySplines="0.6 0 1 1"
        fill="freeze"
      />
      <g>
        <animateTransform
          v-if="animate && level >= 1 && level < 5"
          attributeName="transform"
          type="translate"
          :values="BOB_VALUES"
          :dur="`${BOB_SECONDS_BY_LEVEL[level]}s`"
          repeatCount="indefinite"
        />
        <g>
          <animateTransform
            v-if="animate && rockDegrees > 0"
            attributeName="transform"
            type="rotate"
            :values="rockValues"
            :dur="`${BOB_SECONDS_BY_LEVEL[level] / 2}s`"
            repeatCount="indefinite"
          />
          <defs>
            <linearGradient :id="beamId" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="HOT.core" stop-opacity="0.9" />
              <stop offset="100%" :stop-color="HOT.yellow" stop-opacity="0" />
            </linearGradient>
          </defs>
          <polygon v-if="beamHalfWidth > 0" :points="beamPoints" :fill="`url(#${beamId})`">
            <animate
              v-if="animate && level >= 3"
              attributeName="opacity"
              values="1;0.5;1"
              :dur="`${BLINK_SECONDS_BY_LEVEL[level]}s`"
              repeatCount="indefinite"
            />
          </polygon>
          <g v-if="level === 4">
            <circle v-for="puff in ENGINE_SMOKE" :key="puff.x" :cx="puff.x" :cy="puff.y" r="6" :fill="palette.smoke" opacity="0.7">
              <animate v-if="animate" attributeName="cy" :values="`${puff.y};${puff.y - 26}`" dur="0.9s" repeatCount="indefinite" />
              <animate v-if="animate" attributeName="opacity" values="0.7;0" dur="0.9s" repeatCount="indefinite" />
            </circle>
          </g>
          <path d="M70 92 Q70 52 100 52 Q130 52 130 92 Z" :fill="palette.highlight" opacity="0.55" :stroke="palette.ink" stroke-width="2" />
          <circle cx="100" cy="78" r="11" :fill="ALIEN_GREEN" :stroke="palette.ink" stroke-width="2" />
          <ellipse cx="95" cy="77" rx="2.5" ry="3.5" :fill="palette.ink" />
          <ellipse cx="105" cy="77" rx="2.5" ry="3.5" :fill="palette.ink" />
          <ellipse cx="100" cy="102" rx="34" ry="12" :fill="palette.cap" :stroke="palette.ink" stroke-width="2" />
          <ellipse :cx="SAUCER_CENTER.x" :cy="SAUCER_CENTER.y" rx="64" ry="16" :fill="palette.metal" :stroke="palette.ink" stroke-width="3" />
          <circle
            v-for="(light, index) in RIM_LIGHTS"
            :key="light.x"
            :cx="light.x"
            :cy="light.y"
            r="4"
            :fill="lightColor"
            :stroke="palette.ink"
            stroke-width="1.5"
          >
            <animate
              v-if="animate"
              attributeName="opacity"
              values="1;0.2;1"
              :dur="`${BLINK_SECONDS_BY_LEVEL[level]}s`"
              :begin="`${(index * BLINK_SECONDS_BY_LEVEL[level]) / RIM_LIGHTS.length}s`"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      </g>
    </g>
  </g>
</template>
