# fix: data-analysis スキルの読み直しで、表のファイルを直接書き換えない (#3094)

## 問題

読み直しのあと、エージェントが計算済みの値を表のファイルへ直接書き込んだ。

- 開いている Canvas はファイルを読み直さないので、古い値のまま。
- 画面でセルを直すと表の全体が書き戻されるので、エージェントの値が黙って消える。

`presentSpreadsheet` には既存の表を更新する引数がない。

## 変更

- `server/skills/mulmoterminal-data-analysis/SKILL.md`
  - 「When the user edits the spreadsheet」：表の全体を `presentSpreadsheet` で出し直す。ファイルは書かない。新しい表を直すよう伝える。
  - 「Summary statistics」：`quantile` は Excel の `QUARTILE.INC` / `PERCENTILE.INC` と同じ求め方だと書く。
- ガイド `docs/guide/{en,ja}/spreadsheet.md` の、スキルの節に一言足す。

## 確かめ方

- 新しいセッションで、直した表を「読み直して」と頼む（`claude -p`）。`presentSpreadsheet` が呼ばれ、表のファイルが書き換えられていないこと。
