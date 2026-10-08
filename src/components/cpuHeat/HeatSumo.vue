<script setup lang="ts">
// Two rikishi on a dohyo under a hanging roof: they square off, grapple, strain, and at the finale one throws the other out.
import { computed } from "vue";
import { HOT } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import type { HeatFigureProps } from "./heatFigure";
import type { SumoPose } from "./sumoPose";
import HeatGlow from "./HeatGlow.vue";
import HeatSumoWrestler from "./HeatSumoWrestler.vue";

const props = defineProps<HeatFigureProps>();

const FLOOR_Y = 170;
const SPOTS: Record<StageLevel, { a: number; b: number; pose: SumoPose }> = {
  0: { a: 40, b: 160, pose: "stand" },
  1: { a: 40, b: 160, pose: "stand" },
  2: { a: 62, b: 138, pose: "crouch" },
  3: { a: 80, b: 120, pose: "grapple" },
  4: { a: 80, b: 120, pose: "grapple" },
  5: { a: 80, b: 120, pose: "grapple" },
};
const spot = computed(() => SPOTS[props.level]);
const strain = computed(() => (props.level === 4 ? { dur: "0.14s", dx: 3 } : { dur: "0.55s", dx: 1.5 }));
const straining = computed(() => props.animate && (props.level === 3 || props.level === 4));

const BALES = Array.from({ length: 9 }, (_, index) => 20 + index * 20);
const TASSELS = [
  { x: 26, color: HOT.red },
  { x: 62, color: HOT.yellow },
  { x: 138, color: HOT.orange },
  { x: 174, color: HOT.core },
];
const SALT = Array.from({ length: 7 }, (_, index) => ({ index, begin: `${index * 0.25}s`, reach: 14 + (index % 3) * 6 }));
const SWEAT = [
  { x: 84, y: 90, toX: 60, begin: "0s" },
  { x: 116, y: 90, toX: 140, begin: "0.2s" },
  { x: 86, y: 84, toX: 66, begin: "0.45s" },
  { x: 114, y: 84, toX: 134, begin: "0.6s" },
];
const STEAM = [
  { x: 92, begin: "0s" },
  { x: 108, begin: "0.35s" },
  { x: 100, begin: "0.7s" },
];
const DUST = [
  { x: 198, y: 182 },
  { x: 208, y: 184 },
  { x: 214, y: 180 },
  { x: 204, y: 178 },
];
const PETALS = [
  { x: 20, begin: "1.0s", drift: 28 },
  { x: 60, begin: "1.1s", drift: -20 },
  { x: 100, begin: "0.95s", drift: 24 },
  { x: 140, begin: "1.15s", drift: -26 },
  { x: 175, begin: "1.05s", drift: 18 },
  { x: 80, begin: "1.3s", drift: -16 },
  { x: 125, begin: "1.25s", drift: 22 },
];
const PETAL_PINK = "#ff9ec4";
const THROW_BEGIN = "0.7s";
const THROW_DUR = "0.75s";
const LANDED = "1.45s";
</script>

<template>
  <g>
    <HeatGlow v-if="level < 5" :x="100" :y="120" :r="95" :level="level" :animate="animate" />

    <path d="M20 30 L100 6 L180 30 Z" :fill="palette.cap" :stroke="palette.ink" stroke-width="2.5" stroke-linejoin="round" />
    <path d="M12 33 L188 33" :stroke="palette.ink" stroke-width="5" stroke-linecap="round" />
    <path d="M100 6 L100 30 M60 18 L64 31 M140 18 L136 31" fill="none" :stroke="palette.ink" stroke-width="1.5" opacity="0.6" />
    <g v-for="tassel in TASSELS" :key="tassel.x">
      <line :x1="tassel.x" y1="36" :x2="tassel.x" y2="42" :stroke="palette.ink" stroke-width="1.5" />
      <path
        :d="`M${tassel.x - 3} 42 L${tassel.x + 3} 42 L${tassel.x + 2} 60 L${tassel.x - 2} 60 Z`"
        :fill="tassel.color"
        :stroke="palette.ink"
        stroke-width="1.2"
      />
    </g>

    <path d="M6 172 Q6 192 100 194 Q194 192 194 172 Z" :fill="palette.cap" :stroke="palette.ink" stroke-width="2.5" />
    <ellipse v-for="x in BALES" :key="x" :cx="x" cy="184" rx="9" ry="5" :fill="palette.bone" :stroke="palette.ink" stroke-width="1.5" />
    <ellipse cx="100" :cy="FLOOR_Y + 2" rx="94" ry="13" :fill="palette.bone" opacity="0.35" :stroke="palette.ink" stroke-width="2.5" />
    <ellipse cx="100" :cy="FLOOR_Y + 2" rx="60" ry="8" fill="none" :stroke="palette.ink" stroke-width="1.5" opacity="0.5" />

    <g transform="translate(160 150) scale(0.6)">
      <path d="M-15 0 L-10 -34 L10 -34 L15 0 Z" :fill="palette.cap" :stroke="palette.ink" stroke-width="3" />
      <path d="M-10 -34 L0 -22 L10 -34" fill="none" :stroke="palette.ink" stroke-width="2.5" />
      <circle cx="0" cy="-44" r="10" :fill="palette.bodyStops[1]" :stroke="palette.ink" stroke-width="3" />
      <path d="M-11 -50 L1 -68 L12 -52 Z" :fill="palette.ink" />
      <path d="M-8 -32 L-12 -26" fill="none" :stroke="palette.ink" stroke-width="7" stroke-linecap="round" />
      <g transform="translate(-12 -26)">
        <g>
          <animateTransform
            v-if="animate && level >= 3 && level < 5"
            attributeName="transform"
            type="rotate"
            values="-8;8;-8"
            dur="0.5s"
            repeatCount="indefinite"
          />
          <animateTransform v-if="level === 5" attributeName="transform" type="rotate" values="0;-62" begin="1.6s" dur="0.3s" fill="freeze" />
          <line x1="0" y1="0" x2="-4" y2="-16" :stroke="palette.ink" stroke-width="3" stroke-linecap="round" />
          <ellipse cx="-5" cy="-30" rx="12" ry="16" :fill="HOT.red" :stroke="palette.ink" stroke-width="3" />
          <circle cx="-5" cy="-30" r="4" :fill="HOT.core" />
        </g>
      </g>
    </g>

    <g v-if="level === 1 && animate">
      <circle v-for="grain in SALT" :key="grain.index" :cx="spot.a + 18" cy="104" r="1.8" :fill="palette.highlight" opacity="0">
        <animateMotion :path="`M0 0 Q${grain.reach} -26 ${grain.reach * 2} 8`" :begin="grain.begin" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;0" :begin="grain.begin" dur="1.2s" repeatCount="indefinite" />
      </circle>
    </g>

    <g :transform="`translate(${spot.a} ${FLOOR_Y})`">
      <g>
        <animateTransform
          v-if="straining"
          attributeName="transform"
          type="translate"
          :values="`0 0;${strain.dx} 0;${-strain.dx} 0;0 0`"
          :dur="strain.dur"
          repeatCount="indefinite"
        />
        <animateTransform
          v-if="level === 5"
          attributeName="transform"
          type="rotate"
          values="0 0 0;-5 0 0;-5 0 0;7 0 0"
          keyTimes="0;0.35;0.55;1"
          dur="1.3s"
          fill="freeze"
        />
        <g>
          <set v-if="level === 5" attributeName="opacity" to="0" :begin="LANDED" fill="freeze" />
          <HeatSumoWrestler :pose="spot.pose" :palette="palette" :mawashi="HOT.red" :fierce="level >= 3" />
        </g>
        <g v-if="level === 5" opacity="0">
          <set attributeName="opacity" to="1" :begin="LANDED" fill="freeze" />
          <HeatSumoWrestler pose="victory" :palette="palette" :mawashi="HOT.red" :fierce="false" />
        </g>
      </g>
    </g>

    <g :transform="`translate(${spot.b} ${FLOOR_Y})`">
      <g>
        <animateMotion v-if="level === 5" path="M0 0 Q55 -125 84 12" :begin="THROW_BEGIN" :dur="THROW_DUR" fill="freeze" />
        <g>
          <animateTransform
            v-if="straining"
            attributeName="transform"
            type="translate"
            :values="`0 0;${-strain.dx} 0;${strain.dx} 0;0 0`"
            :dur="strain.dur"
            repeatCount="indefinite"
          />
          <animateTransform
            v-if="level === 5"
            attributeName="transform"
            type="rotate"
            values="0 0 -40;-100 0 -40"
            :begin="THROW_BEGIN"
            :dur="THROW_DUR"
            fill="freeze"
          />
          <g transform="scale(-1 1)">
            <HeatSumoWrestler :pose="spot.pose" :palette="palette" :mawashi="HOT.orange" :fierce="level >= 3" />
          </g>
        </g>
      </g>
    </g>

    <g v-if="level >= 3 && level < 5 && animate">
      <ellipse v-for="drop in SWEAT" :key="`${drop.x}-${drop.y}`" :cx="drop.x" :cy="drop.y" rx="2" ry="3" :fill="palette.highlight" opacity="0">
        <animateMotion :path="`M0 0 Q${(drop.toX - drop.x) / 2} -22 ${drop.toX - drop.x} 10`" :begin="drop.begin" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;0" :begin="drop.begin" dur="0.8s" repeatCount="indefinite" />
      </ellipse>
      <circle v-for="puff in STEAM" :key="puff.x" :cx="puff.x" cy="76" r="3" :fill="palette.smoke" opacity="0">
        <animate attributeName="cy" values="76;46" :begin="puff.begin" dur="1.1s" repeatCount="indefinite" />
        <animate attributeName="r" values="3;12" :begin="puff.begin" dur="1.1s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.7;0" :begin="puff.begin" dur="1.1s" repeatCount="indefinite" />
      </circle>
    </g>

    <g v-if="level === 5">
      <circle v-for="dust in DUST" :key="`${dust.x}-${dust.y}`" :cx="dust.x" :cy="dust.y" r="3" :fill="palette.smoke" opacity="0">
        <animate attributeName="r" values="3;22" :begin="LANDED" dur="0.8s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.85;0" :begin="LANDED" dur="1s" fill="freeze" />
      </circle>
      <ellipse v-for="petal in PETALS" :key="petal.x" :cx="petal.x" cy="20" rx="4" ry="2.4" :fill="PETAL_PINK" opacity="0">
        <animateMotion :path="`M0 0 Q${petal.drift} 80 ${petal.drift / 2} 170`" :begin="petal.begin" dur="1.1s" fill="freeze" />
        <animate attributeName="opacity" values="0;1;1;0" :begin="petal.begin" dur="1.1s" fill="freeze" />
      </ellipse>
    </g>
  </g>
</template>
