# feat(blueprint): コレクションからアプリにする — Cloudflare 対応 (#2555, 6a の続き)

設計 `plans/feat-blueprint-from-collection.md`（#2480）の段階 6 の二つ目。Cloudflare の土台（#2556）の上で、`from-collection` を使えるようにする。

## 方針

- `from-collection` の `bases` に `cloudflare` を足し、工程を 4 つ置く。
  - 記録を移す（`data` の後）: `checks/import-d1.sh local`。
  - 必須の機能（`run-check` の後）: 土台の `tests-pass.sh acceptance`。
  - アクションを機能にする（`run-check` の後）: `checks/actions.sh cloudflare`。
  - 記録を本番に移す（`deploy` の後、`handover` の前）: `checks/import-d1.sh remote`。承認は `deploy-production` と `credential`。
- 置き場所: 記録は D1、画像とファイルは R2（記録と同じパスをキーにする）。
  - 表と列の約束は local と同じにした。D1 は SQLite なので、突き合わせの規則を一つにできる。
  - バケットの名前は `.blueprint/r2-bucket` に書く。`wrangler.jsonc` が紐づけているバケットであることも確かめる。
- `yarn import-source <場所>` の場所は、wrangler の引数（`--local [--persist-to <dir>]` / `--remote`）をそのまま渡す約束にした。
  - 判定は、空のローカルの状態にマイグレーションを当てて 2 回移し、wrangler で D1 と R2 を読み直す（`checks/d1-verify.mjs`）。アプリのコードは通さない。
- 突き合わせの共通化: SQL の表と記録を突き合わせる処理を `compare.mjs` の `tableProblems` にした。
  - local（`import-verify.mjs`）と D1（`d1-verify.mjs`）が同じ規則を使う。
  - 記録が指すファイルの一覧（`pointedAtFiles`）は、Firestore の判定と共有した。
- R2 の `object get` は、無いキーでも終了コード 0 で空のファイルを書く。そのため判定は、元のファイルとバイト列で比べる。
- アクション: Worker の秘密の置き場所は `.dev.vars` なので、`actions.sh` は `.env` と `.dev.vars` のどちらも `.gitignore` にあることを求める。
  - 定期の取り込みは Cron Trigger にする。
- 土台の公開の手順（`cloudflare/skills/deploy`）に、`wrangler.jsonc` が紐づける R2 バケットを作る一文を足した。バケットが無いと公開が失敗する。

## 確かめたこと

- 実物の wrangler で確かめた。手本の Cloudflare アプリの写しに、2 つのコレクション（参照あり、画像あり、真偽値・数値・引用符入りの文字列）と、upsert で移す `import-source` を置いた。
  - `import-d1.sh local` が通った。
  - 壊した場合がそれぞれ名指しで落ちた: 主キーの重複（2 回目で失敗）、R2 に上げない、違うバイト列、紐づけていないバケット、真偽値を文字で持つ、記録を 1 件落とす。
  - `INSERT OR REPLACE` は通った。同じファイルの中で子の行が後から入り直すため。そこでスキルが upsert を求める理由は、「移し替えが書かない列が既定値に戻る」にした。
- `yarn import-source --local` の後に `yarn start` で起動し、実際に配られることを確かめた。
  - `/api/books` が移した記録を返した。
  - R2 から返した画像が、元とバイト列で一致した。
- `d1-verify.mjs` の試験（`d1Verify.spec.ts`）: wrangler の代わりに SQLite とフォルダから答える `yarn` を置いて確かめた。
  - 各項目の落ち方、wrangler の失敗、1000 行を超える表のページ送り。
  - 判定を外すと、対応する試験が落ちる。
- `import-verify.mjs` を共通化した前後を、生成した入力（重複行・欠けた列・欠けたファイルを含む）で比べ、出力と終了コードが一致した。

## 確かめていないこと

- 実際の Cloudflare の本番への移し替え（`--remote`）。アカウントへのログインが要る。判定はローカルと同じ読み方に `--remote` を付けるだけ。
- エージェントがこの組み合わせで一本通すビルド。

## 範囲外

- Supabase の土台（6b）
