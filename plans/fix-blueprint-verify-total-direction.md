# fix: a verify report states a total's difference the right way round (#2563)

## 問題

「文書を確かめる」を実際に回すと、報告に「足すと 55,500円 で、書かれている合計 56,000円 より 500円 多くなっています」と書かれた。向きが逆で、多いのは書かれた合計のほう。機械の記録（verification.json）は `written` と `sum` を持つだけで、向きはエージェントが文章で決めていた。

## 方針

- `total-mismatch` の `detail` に `writtenIs`（`"more"` か `"less"`）と `by`（差、セント単位で計算）を足す。向きは機械が決める。
- 報告の SKILL は、`writtenIs` と `by` のとおりに書き、向きを自分で計算しない、とした。例は「書かれた合計は、内訳を足した額より 500円 多い」。
