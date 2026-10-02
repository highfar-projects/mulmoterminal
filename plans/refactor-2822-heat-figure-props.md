# refactor: one props contract for the heat figures (#2822)

## What

jscpd flagged `HeatRocket.vue` / `HeatSkull.vue` lines 3-10: the imports plus
`defineProps<{ level: StageLevel; palette: HeatPalette; animate: boolean }>()`. Every figure in
`src/components/cpuHeat/` repeats that literal, so fixing only the flagged pair would make two
figures the odd ones out.

- New `src/components/cpuHeat/heatFigure.ts` exports `HeatFigureProps`.
- All seven figures (Balloon, Bomb, Dynamite, Kettle, Rocket, Skull, Volcano) use
  `defineProps<HeatFigureProps>()`; imports that only served the inline literal are dropped.
- `HeatStage.vue` forwards the same three props, so it declares `{ pattern: HeatPattern } & HeatFigureProps`
  (`pattern` first, keeping the compiled prop order).

## Why it preserves behaviour

Only a type moved; no markup, animation or script logic changed. `@vue/compiler-sfc`
`compileScript` was run over every `Heat*.vue` before and after, and the emitted runtime `props`
objects were compared byte for byte: identical.

`test/src/components/heatFigureProps.spec.ts` pins the contract: each figure's runtime props equal
the shared three, all required.

## Declined

Nothing in this cluster.
