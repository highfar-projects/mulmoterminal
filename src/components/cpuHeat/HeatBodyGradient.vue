<script setup lang="ts">
// The lit-from-upper-left shading a figure's body is filled with, from its palette's three stops.
import type { HeatPalette } from "./heatPalette";

defineProps<{ id: string; stops: HeatPalette["bodyStops"] }>();
</script>

<template>
  <radialGradient :id="id" cx="40%" cy="35%" r="75%">
    <stop offset="0%" :stop-color="stops[0]" />
    <stop offset="50%" :stop-color="stops[1]" />
    <stop offset="100%" :stop-color="stops[2]" />
  </radialGradient>
</template>
