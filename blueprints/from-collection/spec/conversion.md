# コレクションからの対応表

土台が local（Express + SQLite + Vue）なら上の表と「表と列の名前」、firebase なら最後の「Firebase（Firestore）」の節に従う。画面と操作は両方に共通。

## local（Express + SQLite + Vue）

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
| `mutate`（`set` / `require` / `params`） | 必ず機能にする。API の操作 ＋ 画面のボタン。`require` は API の入口で検査 |
| `chat` / `agent` | テンプレートを読み、していたことを書く。扱い（機能にする／人が手で行う／やめる）を提案として決め、`.blueprint/actions.json` に書く。機能にするなら、手順をアプリの処理にする（モデルが要る手順だけサーバーから Claude API） |
| `ingest` | 取り込み元と頻度を書く。扱いを同じく `.blueprint/actions.json` に書く。機能にするなら、宣言による取り込みは定期実行の処理にする |

## 表と列の名前（記録の移し替えが突き合わせる約束）

- 表の名前は、コレクションの slug（`-` は `_` にする）。例: `art-festivals` → `art_festivals`。
- 保存する項目の列の名前は、項目のキーのまま（大文字小文字も変えない）。主キーの列も `primaryKey` のキーのまま。
- `ref` の列は、参照先の主キーの値をそのまま持つ。
- `image` / `file` の列は、記録にあったパス（`data/files/` からの相対パス）をそのまま持つ。
- `table` の子の表は `<親の表>_<項目のキー>` とし、親への外部キーを持つ。

この約束を外れると、記録の移し替えの工程の判定が、元の記録と突き合わせられずに落ちる。

## Firebase（Firestore）

記録の移し替えの工程は、この約束で Firestore と Cloud Storage を読み直して突き合わせる。

| コレクション | Firestore での持ち方 |
|---|---|
| コレクション | slug と同じ名前のコレクション（`-` もそのまま） |
| 主キー | 文書 ID（主キーの値） |
| string / text / email / markdown / enum | string。項目の名前はキーのまま |
| number | number |
| boolean | boolean |
| date / datetime | ISO 8601 の string（Timestamp にしない。元の値と同じ文字で突き合わせるため） |
| ref | 参照先の文書 ID の string |
| image / file | Cloud Storage の既定のバケットの、記録と同じパスに置く。項目はそのパス。使ったバケットの名前は `.blueprint/storage-bucket` に書く |
| table | 文書の中の配列（行ごとに map）。件数が多ければサブコレクションにして仕様書に書く |
| money | `{ amount, currency }` の map |
| derived / rollup / backlinks / embed / toggle / flag | 保存しない。クライアントか関数で計算して見せる |

ルールは記録の移し替えのために緩めない（移し替えは Admin SDK で行い、ルールを通らない）。

## 共有アプリの権限（元が共有アプリのとき）

`app.json` の宣言は、仕様書の「誰が何をできるか」の表になり、土台のログイン・役割・ルールの工程の入力になる。local ならサーバーの規則、Firebase ならセキュリティルール（と関数）で強制する。

| app.json | 仕様書での扱い |
|---|---|
| `members`（email → 役割）、役割 owner / editor / viewer / participant / assignee | 役割の表。最初のメンバーの移し方（招待、初回ログイン時の割り当てなど） |
| `collections.<cid>.statusField` / `transitions` / `immutable` / `sealed` | 状態の遷移と、変えてはいけない項目 |
| `collections.<cid>.peerVisibility` / `revealGated` / `revealBy`、`participantRead` | 他の人の記録が見えるか。見える範囲の表 |
| `collections.<cid>.mail` | メールの通知。local は送り方（SMTP の設定）を「未定」に、Firebase は Trigger Email 拡張か関数 |
| `collections.<cid>.aggregate` | 集計の表示 |
| `public.submit.<cid>`（`auth`・`idFrom`・`finalize`・`window`・`selfUpdate` など） | 公開の申込みフォーム。一人一回（本人の ID を文書 ID に）、書き切り（`finalize`）、期限（`window`）は、サーバーやルールの規則として書く |
| `public.view` / `views[].audience` / `live` | 公開の画面と見える範囲、ライブ更新の要否 |
