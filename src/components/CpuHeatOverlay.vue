<script setup lang="ts">
// playfulEffects: a picture drawn behind a terminal, heating up with what the server reports and
// playing its finale once when it cools. Drawn OVER the body with a blend that follows the theme
// (`screen` on dark, `multiply` on light), so the text stays readable and the picture reads as if
// it were behind it — without asking xterm for a transparent canvas.
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import HeatStage from "./cpuHeat/HeatStage.vue";
import { HEAT_PALETTE, type Appearance } from "./cpuHeat/heatPalette";
import type { StageLevel } from "./cpuHeat/stageLevel";
import { patternFor, type HeatLevel } from "../../common/playfulEffects";
import { playfulEffects } from "../composables/playfulEffects";

const props = defineProps<{ sessionId: string | null; heatLevel: HeatLevel; heatFinales: number }>();

// Long enough for every picture's finale to finish; they all end within about 1.5 seconds.
const FINALE_SHOW_MS = 2500;

const finaleShowing = ref(false);
let finaleTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => props.heatFinales,
  (count, previous) => {
    if (count <= previous) return;
    if (finaleTimer !== null) clearTimeout(finaleTimer);
    finaleShowing.value = true;
    finaleTimer = setTimeout(() => {
      finaleShowing.value = false;
      finaleTimer = null;
    }, FINALE_SHOW_MS);
  },
);

const pattern = computed(() => (props.sessionId === null ? null : patternFor(props.sessionId, playfulEffects.value)));
const level = computed<StageLevel>(() => (finaleShowing.value ? 5 : props.heatLevel));

const readAppearance = (): Appearance => (document.documentElement.getAttribute("data-appearance") === "light" ? "light" : "dark");
const appearance = ref<Appearance>(readAppearance());
let appearanceWatch: MutationObserver | null = null;
onMounted(() => {
  appearanceWatch = new MutationObserver(() => (appearance.value = readAppearance()));
  appearanceWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
});
onUnmounted(() => {
  appearanceWatch?.disconnect();
  if (finaleTimer !== null) clearTimeout(finaleTimer);
});
const palette = computed(() => HEAT_PALETTE[appearance.value]);

// Someone who asked the OS for less motion gets the pictures standing still.
const prefersReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const animate = !prefersReducedMotion;
</script>

<template>
  <div
    v-if="pattern !== null && level > 0"
    :key="`${pattern}-${level}`"
    :class="palette.blend"
    class="pointer-events-none absolute inset-x-0 bottom-0 z-10 overflow-hidden"
    aria-hidden="true"
    data-testid="cpu-heat"
    :data-heat-level="level"
  >
    <!-- Critical: the whole body washes red and throbs. -->
    <svg v-if="level === 4" class="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
      <defs>
        <radialGradient id="cpu-heat-vignette" cx="50%" cy="50%" r="75%">
          <stop offset="40%" :stop-color="palette.vignetteBase" />
          <stop offset="100%" stop-color="#ff1a1a" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#cpu-heat-vignette)" opacity="0.55">
        <animate v-if="animate" attributeName="opacity" values="0.15;0.6;0.15" dur="0.7s" repeatCount="indefinite" />
      </rect>
    </svg>
    <div class="absolute inset-0 flex items-center justify-center">
      <HeatStage class="h-[92%] w-auto max-w-[92%]" :pattern="pattern" :level="level" :palette="palette" :animate="animate" />
    </div>
  </div>
</template>
