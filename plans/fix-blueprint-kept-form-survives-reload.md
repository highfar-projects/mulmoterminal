# fix: the form kept while trusting a folder survives a reload (#2585)

## 問題

#2467 で、信頼の確認に答えに行く前のフォームの入力を覚えて、戻ったときに戻すようにした。覚えるのはメモリの中だけなので、その間にページを読み込み直すと消える。

## 方針

- `keepFormFill` は、メモリに加えてタブごとの sessionStorage（`blueprints.keptForm`）にも置く。
- `takeFormFill` は、メモリに無ければ sessionStorage から読み、どちらも消す（一度だけ戻す）。
- 読むときは `formFillSchema`（zod）で形を確かめ、壊れたものは無視する。`FormFill` の型もこのスキーマから作る。
- 「次にできること」の引き継ぎ（`blueprintsViewFollowUp`）は、画面の中の移動なので置かない。
- sessionStorage の読み書きは best-effort（`src/utils/localStore.ts` に localStorage と同じ形の関数を足した）。使えない環境でもフォームは壊れず、メモリだけで動く。
