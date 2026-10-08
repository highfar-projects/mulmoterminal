# feat: sumo heat picture

An eighth `playfulEffects` picture. Two rikishi on a dohyo under a hanging roof square off at the
low levels, grapple and strain at the high ones, and the finale is a throw out of the ring with a
referee pointing his fan and petals falling.

- `common/playfulEffects.ts` — `"sumo"` joins `HEAT_PATTERNS`. `"random"` picks by hash modulo the
  list length, so adding one reassigns some sessions' pictures.
- `src/components/cpuHeat/HeatSumo.vue` — the scene; `HeatSumoWrestler.vue` — one rikishi in his
  own space; `sumoPose.ts` — arm strokes and body squash per pose (data, pinned by a spec).
- The finale must fit inside `FINALE_SHOW_MS` in `CpuHeatOverlay.vue`.
- Colours come from `HeatPalette` and `HOT` so it blends on light and dark themes like the others.

Verified by rendering every level through `HeatStage` to a page and screenshotting it in headless
Chrome, including mid-throw and landed frames of the finale.
