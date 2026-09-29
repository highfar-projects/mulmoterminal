# fix: a form that opens filled in shows the filled part, not the top of the examples (#2474)

## 問題

入力済みで開いたフォーム（「次にできること」から、または信頼の確認から戻ったとき）が例の一覧の先頭から表示され、入れてあるフォルダ・答え・「始める」が見えない。

## 方針

- 入力済みの一文（「…の続きです」「入れていた内容を戻しました」）を一つの要素に包み、入力を当てたあと（`nextTick` のあと）にその要素を `scrollIntoView({ block: "start" })` する。
- 空のフォームや例を選んだときは動かさない。
