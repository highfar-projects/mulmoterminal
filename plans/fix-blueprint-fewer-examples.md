# The new-build form shows a few examples per group (#2784)

With 26 examples (16 under 文書のフォルダ) the new-build form was mostly examples: the task selector sat about 1,900px
down at 1280×900, so anyone not using an example scrolled past all of them to start.

- Each group shows the first example of each task (`firstOfEachUsecase` in `blueprintView.ts`, pure); the rest open
  with 「ほかの例を見る（N 件）」 and close with 「例をたたむ」, per group. Every kind of task stays in view.
- A card's description is clamped to three lines (`line-clamp-3`), the full text on hover (`data-tip`, the shared hover tip — a native `title` is refused by `test/scripts/no-native-title.spec.ts`), and the chosen
  example's full description is shown under 「…の例を使いました」.
- i18n: `presetsMore` / `presetsFewer` in the five locales.

Measured on the real screen at 1280×900: 13 cards instead of 26, and the task selector about 1,170px down instead of
about 1,880px; opening and closing a group works, with no page errors.
