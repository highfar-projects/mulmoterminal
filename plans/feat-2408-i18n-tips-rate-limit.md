# feat: translate the rate-limit gauge's hover and notes, and say what is translated (#2408, part 4b)

The last part of #2408 (4a: `plans/feat-2408-i18n-tips-toolbar.md`).

## Change

- `src/i18n/tips/*.ts`: a `tips.rateLimit` section in all five bundles.
- `rateLimitGauge.ts` keeps every decision (which windows are live, when a note replaces the
  figures, which silence gets which note, the marks) and words through a `translate` it is handed:
  `rateLimitReadout`, `gaugeTitle` and `resetsIn` take it as their last argument, and the probe
  notes are a key table (`PROBE_NOTES`). `RateLimitGauge.vue` passes its `t`.
- `src/i18n/translate.ts`: the `Translate` type, shared with `gridTabs.ts` (4a).
- `settings.language.partial` in all five bundles, the config guide (en / ja) and the README's
  Settings paragraph now say what is translated: Settings, the grid's status words, and every
  button's hover tip and screen-reader label. The README still said "English and Japanese" and
  "only this modal".

## Verification

- `rateLimitGauge.spec.ts` keeps every assertion, with the real messages under the pinned English
  locale as the translator — "resets in 2h 15m", "5h 27% used, resets in 1h 0m", "Work (claude)
  rate limit" and the notes' PATH / API-key / Retrying / trust-prompt wording all still match.
- `rateLimitTipKeys.spec.ts`: the shared census, plus every locale's account note names the account.
- After this part, a scan of `src` for any of the census shapes finds only `WorktreeEnvChip`'s
  `NAME=value`, which is data.
