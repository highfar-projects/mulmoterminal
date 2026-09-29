# fix: the form kept while trusting a folder survives a reload (#2585)

## 問題

#2467 で、信頼の確認に答えに行く前のフォームの入力を覚えて、戻ったときに戻すようにした。覚えるのはメモリの中だけなので、その間にページを読み込み直すと消える。

## 方針

- `keepFormFill` は、メモリに加えてタブごとの sessionStorage（`blueprints.keptForm`）にも置く。
- `takeFormFill` は、メモリに無ければ sessionStorage から読み、どちらも消す（一度だけ戻す）。
- 読むときは `formFillSchema`（zod）で形を確かめ、壊れたものは無視する。`FormFill` の型もこのスキーマから作る。
- 「次にできること」の引き継ぎ（`blueprintsViewFollowUp`）は、画面の中の移動なので置かない。
- sessionStorage の読み書きは best-effort（`src/utils/localStore.ts` に localStorage と同じ形の関数を足した）。使えない環境でもフォームは壊れず、メモリだけで動く。

## レビューで足したもの

- 覚えたフォームに時刻を付け、30 分（`KEPT_FORM_MAX_AGE_MS`）を過ぎたものは戻さずに捨てる。メモリの写しにも sessionStorage の写しにも同じ上限をかける（「次にできること」の引き継ぎは別の置き場で、上限は無い）。信頼の確認をやめたまま、ずっとあとで新しく作るフォームを開いたときに、古い答えが戻ってこないようにするため（Codex の指摘）。
