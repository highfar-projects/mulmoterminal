# feat: a search box in the middle of the top bar, for those who switch it on (#2569)

#2411 plan step 9 (上の段の中央に検索欄を置くか). Decided: only for users who switch it on in
Settings; everything else stays as it is (the Commands button and the palette key are unchanged).

## Shape

Mirrors `showLoadAverage`:

- `common/paletteSearchBox.ts`: the default (`false`) and the sanitizer, shared by both sides.
- Server: `paletteSearchBox` in `AppConfig` (load, POST merge, public view).
- Client: `createGlobalFlag("paletteSearchBox", …)`, adopted in `useAppConfig`; a checkbox in
  Settings → Grid header read-outs, beside the load average one (a refused save puts it back).
- `PaletteSearchBox.vue`: on every screen, as the palette key works everywhere — a button styled as a field, between the toolbar's left group and the
  notification bell (whose `ml-auto` puts it in the free middle). Click / Enter / Space open the
  palette; the palette's key is shown when one is bound.
- Docs: `mulmoterminal-config` skill, the en/ja features table and the `command-palette` row.
- The box sits in a `min-w-0 flex-1` middle wrapper, the only part of the bar that gives way: it
  shrinks at a narrow width and is left out below `md`, so the right-hand controls stay on screen.
