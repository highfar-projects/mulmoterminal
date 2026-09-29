# fix: the facts view writes a currency symbol before its figure and an English weekday in ASCII brackets (#2598)

## 問題

「文書を確かめる」で承認の前に読む facts.txt が、英語の文書だと金額を「320 $」、曜日を「2026-10-08（Thursday）」と出していた（英語の旅程を実際に回して見つけた）。

## 方針

- 通貨の記号（$、US$、€、£、¥、￥）は数字の前に置く（$320、€1,234.5）。語の単位（円、USD）はこれまでどおり後ろ（24,000 円、5 USD）。
- 英語の曜日は半角の括弧（2026-10-08 (Thursday)）、日本語の曜日は全角の括弧（2026-10-01（金））。
