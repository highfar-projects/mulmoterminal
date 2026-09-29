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

コレクションごとに表を一つ。表と列の名前は `spec/conversion.md` の「表と列の名前」の約束に従う（記録の移し替えがこの名前で突き合わせる）。項目ごとに一行で、元の項目名（`` `books.lentTo` `` の形）、ラベル、元の型、この土台での持ち方、必須かを書く。`derived` / `embed` / `toggle` / `flag` のような保存しない項目も、どう計算して見せるかを書いて残す。

## 画面（元のビューから）

既定の一覧・詳細・入力フォームに加えて、元の `displayField`・`kanbanField`・`calendarField` などが指す画面と、`views` にあるカスタムビューを、ビューの `id` ごとに書く。カスタムビューは HTML を読み、同じことができる画面として書き直す。

## 操作（元のアクションから）

元の `actions`・`collectionActions` をアクションの `id` ごとに（`` `books.actions.tidy` `` の形で）、`ingest` は `` `books.ingest` `` として書く。`mutate` は API の操作と画面のボタンにする。`chat` / `agent` と `ingest` はテンプレートを読み、何をしていたかを書いたうえで、どう置き換えるかを「未定」とし、`.blueprint/open-questions.md` に選択肢（アプリの機能として作る／人が手で行う／やめる）を書く。

## 最初の版に入れるもの（必須）

{{mustHaves}}

空なら、元のコレクションでできることすべて。一つずつ番号を付けて書く。最後の工程で、番号ごとに「動くこと」を試験で確かめる。

## あとでよいもの

{{later}}

## 画面の言葉

{{uiLanguage}}

## 扱う情報

いちばん気をつけるもの: {{dataSensitivity}}
