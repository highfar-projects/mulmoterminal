# feat: a next step can carry the finished build's own answers (#2482)

## 問題

「文書を書く」の「次にできること」から「文書を整える」を開くと、「どの規約に合わせますか」が空のまま。`next` は決まった答え（`answers`）しか渡せない。

## 方針

- `nextStepSchema` に `carry`（次の質問の id → 終わったビルドの質問の id、既定 `{}`）を足す。
- `nextOptions(packs, pair, finishedAnswers)` は、写した答えの上に決まった答えを重ねる（両方が同じ質問なら決まった答えが勝つ）。終わったビルドに無い答えは写さない。
- 実行画面は `view.run.answers` を `BlueprintNextSteps` に渡す。2026-09-28 より前のビルドは答えを記録していないので、写すものが無い（決まった答えだけ）。
- `write` → `polish` で `style` を写す。両方の選択肢の文言は同じ。
- パックの spec で次のことを確かめる。
  - 写す元の質問を終わったビルドが聞いている。
  - 写す先の質問を次のビルドが聞いている。
  - 元が選択肢なら、そのすべてを先が受け付ける。
  - 自由記述なら、先も同じ種類である。
