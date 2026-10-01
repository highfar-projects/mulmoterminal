# refactor: #2822 "ui-other" duplicate-code cluster

Part of #2822 (jscpd alerts). Behaviour-preserving extractions only.

## Extracted

| clone | extraction | why it is the same behaviour |
|---|---|---|
| `CellLaunchForm.vue` / `LaunchPanel.vue` resume emit | `src/components/resumeRequest.ts` (`ResumeRequest` type) | Type only, erased at compile. The compiled `emits` arrays of both SFCs were compared before and after with `@vue/compiler-sfc`: identical. LaunchPanel re-emits the form's event, so one declaration is the point. |
| `PromptsPane.formatTime` / `TranscriptPane.formatAt` | `src/components/clockLabel.ts` | Old bodies run beside the new over generated epoch numbers (fractional, out-of-range, midnight boundary) and timestamp strings, in three time zones: no differences. Mutations of the new function are caught by that harness. |
| `ToolsPane` / `BlueprintLiveActivity` tool-call feed | `src/composables/useToolCallFeed.ts` | Old and new components mounted with `useSessionFeed` captured; options compared by behaviour (keys, URLs and channels over generated ids, `identify`/`parse` over generated rows, the session-change hook's effect on the DOM): identical. |
| `submitText` / `pasteAndSubmit` body in `useTerminalConnections.ts` | module-internal `writeThenSubmit(c, text, wrap, delay)` | The origin/main module copied verbatim and driven beside the new one over generated worlds (both entry points, missing slot, claude/shell, both submit modes, texts incl. empty, socket open/closed/connecting/closing at the call, scroll setting, socket closed / reconnected / retargeted before the submit fires): no differences. Each edited line mutated once, each mutation caught. |
| `participateHarness.ts` batch / transaction fakes | `opRecorder(ops)` in the same file | Old and new harness modules driven with generated op sequences through `writeBatch()` (all commit outcomes) and `runTransaction`: identical results and `bag.batched`. |

Permanent tests harvested from the harnesses: `clockLabel.spec.ts`, `useToolCallFeed.spec.ts`,
`terminalConnectionsWriteThenSubmit.spec.ts` (delay per path, no stray submit to a reconnected or
closed socket). Each was break-verified.

## Declined

`cpuHeat/HeatRocket.vue` / `HeatSkull.vue` (lines 3-10): the duplicated tokens are the imports and
`defineProps<{ level; palette; animate }>()` that every stage figure in `cpuHeat/` repeats. Lifting it
for only the two flagged files would make two of the figures differ from the rest; doing it properly
means a shared `HeatFigureProps` type adopted by every figure, which touches files outside this
cluster. It would remove one alert and change no behaviour; every figure is rendered from the one
`<component :is>` in `HeatStage.vue` with the same three props, so the shape has a single caller.

Also left: `TerminalCell.vue`'s `resumeSession` parameter spells the same shape as `ResumeRequest`;
it is outside this cluster's file list.
