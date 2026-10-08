# feat: UFO heat picture (#2937)

A ninth `playfulEffects` picture. A flying saucer hovers and bobs at the low levels, beams down and
rocks harder as the load climbs, runs its rim lights red at the top, and on the finale shoots off
into the sky.

- `common/playfulEffects.ts` — `"ufo"` joins `HEAT_PATTERNS`. `"random"` picks by hash modulo the
  list length, so adding one reassigns some sessions' pictures.
- `src/components/cpuHeat/HeatUfo.vue` — the scene; registered in `HeatStage.vue`.
- The finale must fit inside `FINALE_SHOW_MS` in `CpuHeatOverlay.vue`.
- Colours come from `HeatPalette` and `HOT` so it blends on light and dark themes like the others.
- `mulmoterminal-config` skill lists the new value.
