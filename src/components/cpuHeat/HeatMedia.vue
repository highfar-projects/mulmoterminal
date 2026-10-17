<script setup lang="ts">
// One of the user's own files at one heat level: the same opacity per level and the same shake at
// the last one as a built-in picture, and the finale file (when there is one) for the finale.
import { computed, onUnmounted, ref, watch } from "vue";
import type { PublicPlayfulItem } from "../../../common/playfulMedia";
import { STAGE_OPACITY, type StageLevel } from "./stageLevel";

const props = defineProps<{ item: PublicPlayfulItem; level: StageLevel; animate: boolean }>();

const isFinale = computed(() => props.level === 5);
const file = computed(() => (isFinale.value && props.item.finale ? props.item.finale : props.item.media));

// The built-in pictures' SVG shake (HeatStage.vue), as a percentage of the box so it scales the same.
const SHAKE_KEYFRAMES: Keyframe[] = [
  { transform: "translate(0, 0)" },
  { transform: "translate(-1.5%, 0.5%)" },
  { transform: "translate(1%, -1%)" },
  { transform: "translate(-1%, 1%)" },
  { transform: "translate(1.5%, 0)" },
  { transform: "translate(0, 0)" },
];
const SHAKE_MS = 180;

const box = ref<HTMLElement | null>(null);
let shake: Animation | null = null;
const stopShake = (): void => {
  shake?.cancel();
  shake = null;
};
watch(
  [box, () => props.level, () => props.animate],
  ([element, level, animate]) => {
    stopShake();
    if (element && animate && level === 4 && typeof element.animate === "function")
      shake = element.animate(SHAKE_KEYFRAMES, { duration: SHAKE_MS, iterations: Infinity });
  },
  { immediate: true },
);
onUnmounted(stopShake);
</script>

<template>
  <div ref="box" class="flex h-[92%] w-[92%] items-center justify-center" :style="{ opacity: STAGE_OPACITY[level] }" data-testid="cpu-heat-media">
    <!-- Scaled to the box whatever the file's own size, so it stands as large as a built-in picture.
         Always muted: a terminal is no place for a sound nobody asked to hear. A finale plays once. -->
    <video
      v-if="file.kind === 'video'"
      :key="file.url"
      :src="file.url"
      class="h-full w-full object-contain"
      muted
      autoplay
      playsinline
      disablepictureinpicture
      :loop="!isFinale"
    />
    <img v-else :key="file.url" :src="file.url" alt="" draggable="false" class="h-full w-full select-none object-contain" />
  </div>
</template>
