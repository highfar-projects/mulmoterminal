# {{appName}} — 何を作るか

> 設計図パック `from-collection` の雛形。`{{…}}` はヒアリングの答えで埋める。アプリ名が空なら、元のコレクションの `title` を使う。
> 元のコレクションの写しは `.blueprint/source/` にある。まず `source.json` を読み、そこに並ぶコレクションごとに `collections/<slug>/schema.json` と `SKILL.md`、ビューとテンプレートを読む。
> 表・画面・操作は、このパックの `spec/conversion.md` の対応に従って写しから起こす。元のコレクションは変えない。
> 元のものは、どのコレクションのものかが分かる名前をバッククォートで囲んで必ず書く。項目は `` `books.lentTo` ``、ビューは `` `books.views.board` ``、アクションは `` `books.actions.tidy` ``、自動取り込みは `` `books.ingest` ``。移さないものも、その名前を挙げて理由を書く。

## 元にしたもの

- コレクション: `{{source}}`（つながっていて一緒に写したもの、見つからなかったものは `source.json` のとおりに書く）
- 記録も写したか: {{copyRecords}}（写したなら、コレクションごとの件数を `records.jsonl` から数えて書く。移し替えは「記録を移す」の工程で行う）
- なぜアプリにするか: {{whyApp}}

## 使う人

{{audience}}。ログイン: {{signIn}}。役割: {{roles}}

## 扱うもの（元の項目から）

コレクションごとに表（Firebase ならコレクション）を一つ。名前は `spec/conversion.md` の約束（local は「表と列の名前」、Firebase は「Firebase（Firestore）」）に従う（記録の移し替えがこの名前で突き合わせる）。項目ごとに一行で、元の項目名（`` `books.lentTo` `` の形）、ラベル、元の型、この土台での持ち方、必須かを書く。`derived` / `embed` / `toggle` / `flag` のような保存しない項目も、どう計算して見せるかを書いて残す。

## 画面（元のビューから）

既定の一覧・詳細・入力フォームに加えて、元の `displayField`・`kanbanField`・`calendarField` などが指す画面と、`views` にあるカスタムビューを、ビューの `id` ごとに書く。カスタムビューは HTML を読み、同じことができる画面として書き直す。

## 操作（元のアクションから）

元の `actions`・`collectionActions` をアクションの `id` ごとに（`` `books.actions.tidy` `` の形で）、`ingest` は `` `books.ingest` `` として書く。それぞれ、何をしていたか（`chat` / `agent` と `ingest` はテンプレートを読んで）と、新しいアプリでどう扱うかを書く。扱いは三つのどれか。

- **機能にする**（`feature`）: `mutate` は API の操作と画面のボタン。`chat` / `agent` はテンプレートの手順をアプリの処理にする。AI が要る手順は、サーバー側から Claude API を呼ぶ機能にする（鍵は `.env`）。宣言による取り込み（rss / atom / http-json）は定期実行の処理にする。
- **人が手で行う**（`manual`）: README に手順を書く。
- **やめる**（`drop`）: 仕様書に理由を書く。

`mutate` は必ず「機能にする」。ほかは提案として選び、迷うものは `.blueprint/open-questions.md` に選択肢を書く（人が仕様書の会話で決め直せる）。

決めた扱いは `.blueprint/actions.json` にも書く（次の工程と判定がこれを読む）。元のアクションと取り込みを、一つ残らず一度ずつ。

```json
{ "actions": [
  { "name": "books.actions.tidy", "kind": "agent", "decision": "feature", "how": "…" },
  { "name": "books.ingest", "kind": "rss", "decision": "manual", "how": "…" }
] }
```

元にアクションも取り込みも無ければ、このファイルは要らない。

## 誰が何をできるか（元が共有アプリのとき）

`source.json` の `from` が `app` なら、`.blueprint/source/app.json` の宣言を、このパックの `spec/conversion.md` の「共有アプリの権限」に従って、役割ごと・コレクションごとの「誰が何をできるか」の表にする。宣言ごとに、次の名前をバッククォートで囲んで必ず書く。

- メンバーと役割: `` `app.members` ``（メールアドレスは仕様書に書き写さず、役割ごとの人数と、最初のメンバーをどう移すかを書く）
- コレクションごとの宣言（状態の遷移、変えてはいけない項目、見える範囲、メール、集計）: `` `app.collections.<cid>` ``
- 公開の申込み: `` `app.public.submit.<cid>` ``（一人一回・書き切り・期限を、サーバーやルールの規則として書く）
- 公開の画面: `` `app.public.view` ``、宣言された画面: `` `app.views.<id>` ``

元が共有アプリでなければ、この節は「該当なし」とだけ書く。

## 最初の版に入れるもの（必須）

{{mustHaves}}

空なら、元のコレクションでできることすべて。一つずつ番号を付けて書く。最後の工程で、番号ごとに「動くこと」を試験で確かめる。

## あとでよいもの

{{later}}

## 画面の言葉

{{uiLanguage}}

## 扱う情報

いちばん気をつけるもの: {{dataSensitivity}}
