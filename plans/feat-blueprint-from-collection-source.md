# feat(blueprint): コレクションを選んで、その形から local のアプリを作る (#2502)

設計 `plans/feat-blueprint-from-collection.md`（#2480）の段階 1。

## 方針

- **質問の型 `pick: "collection"`**（`common/blueprint/hearing.ts`）
  - 1 行のテキスト。複数行や選択肢の型とは組み合わせられない。
  - 一つのヒアリングに一つだけ。二つあると、どちらの写しを置くかが決まらない。
- **一覧の口** `GET /api/blueprints/collections`
  - フォームの選択欄（`BlueprintCollectionPicker.vue`）と、始めるときのサーバーの検査は、同じ探し方（`CLAUDE_CWD` で `discoverCollections`、`/api/collections/list` と同じ根）を使う。
  - 共有アプリのコレクション（`appId` あり）は出さない。
- **写し**
  - どれを写すかは純粋な関数（`common/blueprint/collectionSource.ts`）で決める。
    - つながり（`ref` / `table` の中の `ref` / `embed` / `backlinks` / `rollup`）をたどる。列挙はコアの `uniqueRefTargets` などを使う。
    - 宣言されたビューとテンプレートだけを、`views/*.html` と `templates/*.md` の形に限って写す。
    - 見つからないつながり先は `source.json` の `missing` に書く。
  - 読み書きは `server/blueprint/collectionSnapshot.ts`。
    - スキルのフォルダの外を指すリンクは読まない。
    - 既存の写しがあれば何も書かず 409（見本のファイルと同じ `samples-clash`）。
    - 途中で失敗したら、書いたものを消す。
- **種類のパック `blueprints/from-collection/`**（`bases: ["local"]`）
  - 変換は土台の「仕様書を書く」工程の中で行う。仕様書の直後に工程を差し込むと、人の確認（`review` はその工程の前で止まる）が変換より前になってしまうため。
    - 土台の仕様書のスキルは、種類の `spec/requirements.md` を読み込むので、そこに写しの読み方を書く。変換表は `spec/conversion.md`。
  - 判定: 土台の `local/checks/spec.sh` に、種類が `checks/spec.sh` を持てばそれも走らせる口を足した。
    - `from-collection` の判定は、写したコレクションごとに、全項目・全ビュー・全アクション・自動取り込みが、コレクション名付きの名前（`` `books.title` `` / `` `books.views.board` `` / `` `books.actions.tidy` `` / `` `books.ingest` ``）をバッククォートで囲んだ形で仕様書に出ることを確かめる。コレクション名を付けるのは、二つのコレクションが同じキー（`id`、`name`）を持つと片方がもう片方の代わりに通ってしまうため。囲むのは、短い名前が別の単語の中で見つかってしまうのを避けるため。
  - 写しを書く途中のフォルダ（`.blueprint` を含む）がリンクやファイルなら、何も書かずに断る。リンクをたどってプロジェクトの外に書かないため。
  - 選んだコレクション名の前後の空白は削り、削った名前を答えとして記録する（`source.json` と同じ名前になる）。
  - 必須の機能の試験（`product` と同じ）。

## 確かめたこと

- 試験: 純粋な関数、写しの読み書き（一時フォルダ、リンクで外を指すファイル、既存の写し）、API（一覧、始める、知らないコレクション、既存の写し）、選択欄の部品、ヒアリングの規則、パックの試験（`packs.spec.ts` が新しいパックを自動で検査する）。
- 実物: 作業用の HOME とワークスペースに実物のコレクションの形を写し、この作業コピーのサーバーを別ポートで起動した。
  - 一覧が出ること。
  - `books`（`ref` → `authors`）で始めると両方が写ること。
  - `jma-weather` でビューとテンプレートが写ること。
  - 仕様書の判定が、キーが欠けると落ち、揃うと通ること（`jma-weather` の全キーでも）。

## 範囲外

- 記録の写しと移し替え（段階 2）
- firebase（段階 3）
- 共有アプリ（段階 4）
- アクションの書き換えの作り込み（段階 5）
