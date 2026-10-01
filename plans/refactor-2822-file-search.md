# refactor: file-search cluster of #2822

Two jscpd clones between `FileFinder.vue` and `FileSearch.vue`.

## Extracted

- **Panel keyboard + outside click.** Both panels carried the same `onKeydown` (IME guard, Escape
  closes, Enter picks, arrows only — never Home/End — move through `menuFocusMove`) and the same
  `onOutside`. The decision is now the pure `pickerPanelKeyAction` (`src/components/pickerPanelKeys.ts`);
  `usePickerPanelKeys` (`src/composables/`) applies it — `preventDefault` exactly when an action
  results, then close / pick / move — and owns `onOutside`. Each component wires it with its own
  `pick` and `emit("close")`. Mount/unmount listener registration stays in each component, so hook
  order is unchanged.
- **Context lines around the selected match.** The before/after blocks in `FileSearch.vue` were the
  same markup over two arrays; now `SearchContextLines.vue`. The `data-testid` falls through to the
  root, so the rendered DOM is the same.

## Why behaviour is preserved

The old `onKeydown`/`onOutside` of both components were copied verbatim into a throwaway harness and
run beside the composable over generated keys × IME state × list sizes × selections (including
out-of-range ones) and over outside-click targets, comparing the full call log, `preventDefault`
and the resulting selection: no mismatches. The harness was checked by a deliberate mutation of the
new code, which it flagged. Its generator and properties live on in `pickerPanelKeys.spec.ts`.

## Declined

Nothing.
