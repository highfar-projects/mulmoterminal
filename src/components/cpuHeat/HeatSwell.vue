<script setup lang="ts">
// Swell and shrink about a centre point once hot; faster when critical.
import type { StageLevel } from "./stageLevel";

defineProps<{ x: number; y: number; level: StageLevel; animate: boolean }>();
</script>

<template>
  <g :transform="`translate(${x} ${y})`">
    <g>
      <animateTransform
        v-if="animate && level >= 3 && level < 5"
        attributeName="transform"
        type="scale"
        :values="level === 4 ? '1;1.06;1' : '1;1.03;1'"
        :dur="level === 4 ? '0.35s' : '0.8s'"
        repeatCount="indefinite"
      />
      <g :transform="`translate(${-x} ${-y})`"><slot /></g>
    </g>
  </g>
</template>
