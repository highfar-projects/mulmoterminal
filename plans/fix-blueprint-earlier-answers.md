# fix: a later step never hears what the person decided in an earlier one

## 問題

工程の途中で人が答えたことは、その工程のプロンプトにだけ入る。次の工程は `.blueprint/answers.json`（最初の聞き取り）しか知らない。2026-09-29 に「文書を整える」を回すと、調べる工程で「範囲を広げる」と答えたのに、次の整える工程が answers.json との食い違いに気づいて同じことをもう一度聞いた。

## 方針

- 純粋関数 `earlierAnswers(steps, states, stepId)`（`common/blueprint/stepPrompt.ts`）が、計画の順に、この工程より前の工程で人が答えた問いと答えを、工程の名前つきで返す。
- `stepPrompt` はそれを「前の工程で人と決めたこと。answers.json と食い違うときはこちらが勝つ」として載せる。無ければ何も載せない。
- executor は工程を始めるたびにそれを渡す。answers.json 自体は書き換えない。同じフォルダのほかのビルドと分け合う記録で、最初の聞き取りのまま残す（同じフォルダのビルドがそれぞれ自分の答えで働くようにした変更の決め事）。
