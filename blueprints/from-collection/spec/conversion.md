# コレクションからの対応表（local: Express + SQLite + Vue）

仕様書の工程が、写し（`.blueprint/source/`）から表・画面・操作を起こすときに従う。

## 項目の型

| コレクション | この土台での持ち方 |
|---|---|
| string / text / email / markdown | TEXT。email は形を検査、markdown は画面で整形して表示 |
| number | REAL（整数だけなら INTEGER） |
| money | 金額を INTEGER（最小単位）＋通貨の列 |
| boolean | INTEGER 0/1 |
| date / datetime | TEXT（ISO 8601） |
| enum | TEXT ＋ 値の CHECK 制約。`default` は列の既定値 |
| image / file | ファイルは `data/files/`、列にはその中のパス |
| ref | 参照先の表への外部キー |
| table | 子の表（親への外部キー）。行の項目も同じ対応で |
| derived | 保存しない。API で式どおりに計算して返す |
| rollup / backlinks | 集計・逆引きの問い合わせ |
| embed / toggle / flag | 保存しない。画面の表示の仕様にする |
| `when` | 画面で条件付きで表示する（値は消さない） |
| `required` / `primary` | NOT NULL / 主キー |

## 画面

- 一覧・詳細・入力フォームは、元の項目とラベルのまま。
- `displayField` は一覧の見出し。`kanbanField` はその enum の列ごとのカンバン画面。`calendarField`（`calendarEndField`・`calendarTimeField`）はカレンダー画面。
- `completionField` / `completionDoneValues` は完了の状態。`triggerField`（`triggerLeadDays`・`notifyWhen`）は期日の知らせ。知らせ方は画面の中で出す（メールなどは「未定」）。
- カスタムビュー（`views/*.html`）は HTML を読み、同じ情報と操作を持つ画面（Vue）として書き直す。HTML はそのまま使わない。

## 操作

| 元 | 置き換え |
|---|---|
| `mutate`（`set` / `require` / `params`） | API の操作 ＋ 画面のボタン。`require` は API の入口で検査 |
| `chat` / `agent` | テンプレートを読み、していたことを書く。置き換え方は「未定」 |
| `ingest` | 取り込み元と頻度を書く。置き換え方は「未定」 |
