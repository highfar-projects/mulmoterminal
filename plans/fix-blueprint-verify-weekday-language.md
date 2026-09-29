# fix: a weekday mismatch records the actual weekday the way the document writes it (#2596)

## 問題

英語の旅程（「Saturday, October 9」、実際は金曜）を「文書を確かめる」に読ませると、機械の記録が `{"written": "Saturday", "actual": "金"}` になった。報告を書くエージェントは訳して正しく書いたが、記録は文書と同じ書き方にしておきたい（合計の向きを機械の側で決めた #2565 と同じ考え方で、文章に任せる判断を減らす）。

## 方針

- `weekdayLike(written, index)`（`blueprints/verify/checks/rules.mjs`）は、書かれた曜日と同じ形で曜日を出す。
  - 木・（木）・木曜日 → 金
  - Thursday → Friday、Thu → Fri、Thu. → Fri.
- `weekday-mismatch` の `detail.actual` はこれを使う。
