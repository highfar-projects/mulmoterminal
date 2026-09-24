<script setup lang="ts">
// A bundle of dynamite with a timer that really counts down, then the blast. The timer stops at
// 0:01 and blinks there: only stopping the process (the finale) lets it reach zero.
import { computed, onUnmounted, ref, watch } from "vue";
import { HOT, type HeatPalette } from "./heatPalette";
import type { StageLevel } from "./stageLevel";
import HeatSpark from "./HeatSpark.vue";
import HeatBurst from "./HeatBurst.vue";
import HeatGlow from "./HeatGlow.vue";

const props = defineProps<{ level: StageLevel; palette: HeatPalette; animate: boolean }>();

const START_SECONDS: Record<StageLevel, number> = { 0: 0, 1: 0, 2: 30, 3: 10, 4: 5, 5: 0 };
const LAST_SECOND = 1;
const TICK_MS = 1000;
const SECONDS_PER_MINUTE = 60;

const remaining = ref(START_SECONDS[props.level]);
let ticker: ReturnType<typeof setInterval> | null = null;
const stopTicking = (): void => {
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
};
const startCountdown = (level: StageLevel): void => {
  stopTicking();
  remaining.value = START_SECONDS[level];
  if (remaining.value <= LAST_SECOND) return;
  ticker = setInterval(() => {
    remaining.value -= 1;
    if (remaining.value <= LAST_SECOND) stopTicking();
  }, TICK_MS);
};
watch(() => props.level, startCountdown, { immediate: true });
onUnmounted(stopTicking);

const formatted = (seconds: number): string => `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;
const timer = computed(() => {
  if (props.level === 1) return "--:--";
  return props.level === 5 ? formatted(0) : formatted(remaining.value);
});
const FINALE_HOLD_SECONDS = 0.6;
const FINALE_FADE_SECONDS = 0.8;
const holding = computed(() => props.level >= 2 && props.level < 5 && remaining.value <= LAST_SECOND);
const STICKS = [62, 88, 114];
</script>

<template>
  <g>
    <HeatBurst v-if="level === 5" :x="100" :y="110" :scale="1.1" :delay-seconds="FINALE_HOLD_SECONDS" />
    <g>
      <animate
        v-if="level === 5"
        attributeName="opacity"
        values="1;1;0"
        :keyTimes="`0;${FINALE_HOLD_SECONDS / FINALE_FADE_SECONDS};1`"
        :dur="`${FINALE_FADE_SECONDS}s`"
        fill="freeze"
      />
      <HeatGlow :x="100" :y="115" :r="95" :level="level" :animate="animate" />
      <path d="M101 70 Q104 50 118 42 Q128 36 132 26" fill="none" :stroke="palette.fuse" stroke-width="5" stroke-linecap="round" />
      <rect v-for="x in STICKS" :key="x" :x="x" y="70" width="26" height="100" rx="6" fill="#d8342a" :stroke="palette.ink" stroke-width="2" />
      <rect x="58" y="96" width="86" height="12" :fill="palette.cap" :stroke="palette.ink" stroke-width="2" />
      <rect x="58" y="148" width="86" height="10" :fill="palette.cap" :stroke="palette.ink" stroke-width="2" />
      <rect x="70" y="116" width="62" height="26" rx="4" :fill="palette.hole" :stroke="palette.ink" stroke-width="2" />
      <text x="101" y="135" text-anchor="middle" font-family="ui-monospace, monospace" font-size="17" font-weight="700" :fill="HOT.red">
        {{ timer }}
        <animate v-if="animate && holding" attributeName="opacity" values="1;0.15;1" dur="0.5s" repeatCount="indefinite" />
      </text>
      <HeatSpark v-if="level >= 2 && level < 5" :x="132" :y="26" :big="level >= 3" :animate="animate" />
    </g>
  </g>
</template>
