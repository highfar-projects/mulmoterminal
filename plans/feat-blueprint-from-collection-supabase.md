# feat(blueprint): コレクションからアプリにする — Supabase 対応 (#2555, 6b の続き)

設計 `plans/feat-blueprint-from-collection.md`（#2480）の段階 6 の最後。Supabase の土台（#2589）の上で、`from-collection` を使えるようにする。

## 方針

- `from-collection` の `bases` に `supabase` を足し、工程を 4 つ置く（Cloudflare と同じ形）。
  - 記録を移す（`data` の後）: `checks/import-supabase.sh local`。
  - 必須の機能（`run-check` の後）: 土台の `tests-pass.sh acceptance`。
  - アクションを機能にする（`run-check` の後）: `checks/actions.sh supabase`。
  - 記録を本番に移す（`deploy` の後、`handover` の前。承認は `deploy-production` と `credential`）: `checks/import-supabase.sh linked`。
- 置き場所: 記録は Postgres、画像とファイルは Storage（記録と同じパスをキーにする。バケットはマイグレーションで作り、名前を `.blueprint/supabase-bucket` に書く）。表と列の名前は local と同じ。値は Postgres の型で持つ（boolean、date / timestamptz、numeric）。
- 移し替えも読み直しも Supabase の CLI で行う（`--local` / `--linked`）。秘密の鍵は使わず、本番は本人の `supabase login` と `link` で書く。
- 移した記録の持ち主は仕様書で決める。既定は本人のアカウント（手元では試しのデータの利用者、本番では `--owner <メール>`）。
- 突き合わせは `compare.mjs` の `tableProblems` を使う。値の持ち方の違い（真偽値を 0/1 で持つか、日付を同じ時刻として比べるか）は、店ごとの設定（`SQLITE_STORE` / `POSTGRES_STORE`）で渡す。既定は今までどおりで、local・D1・Firestore の比べ方は変わらない。
- 試しの行: 土台のセキュリティ診断は public の表すべてに試しの行を求めるので、判定はデータベースを作り直した直後に試しの行の主キーを控え、数えるときはそれを除く（記録にもある主キーは記録の行として数える）。
- アクション: サーバーの処理は Postgres の関数（`rpc`）か Edge Functions。モデルを呼ぶ鍵は `supabase/functions/.env`（`.gitignore` に入れる）と `supabase secrets set`。`actions.sh` はこのファイルが無視されていることを確かめる（ファイル名だけの `.env` の行でもよい）。

## 実物で分かったこと（スキルと判定に入れた）

- `supabase db query --file` は一つの文しか流せない（複数だと「multiple commands」で断られる）。移し替えは一つの `do $$ … $$` ブロックに包む。
- `supabase storage cp` には `--experimental` が要り、既にあるキーには上書きせず断る（2 回目の移し替えが 409 で止まる）。先に `storage rm … --yes` で消す（無くても成功する）。
- 無いオブジェクトを `storage cp` で下ろすと失敗するが、空のファイルが残る。判定はバイト列で比べる。
- CLI の JSON では、日付が `2026-01-02T00:00:00Z`、numeric が文字列、boolean がそのまま返る。
- この機械では、既定の `TMPDIR` にある Bun の展開ファイル（`.bun-501-*.node`）の署名確認が止まって、Supabase の CLI が固まることがあった。新しい `TMPDIR` を指すと動く。

## 確かめたこと

- 実物（手元の Supabase 一式）で確かめた: 手本のアプリに、2 つのコレクション（参照あり、真偽値・数値・日付・画像あり）の写し、移し先の表とバケットのマイグレーション、試しの行、スキルどおりの `import-source` を置いた。
  - `import-supabase.sh local` が通った（試しの行がある表でも数が合う）。
  - 壊すとそれぞれ名指しで落ちた: 記録を 1 件落とす、真偽値を逆にする、日付をずらす、upsert をやめる（2 回目で失敗）、画像を上げない、違うバイト列。
- 試験: `supabaseVerify.spec.ts`（代わりの CLI で表と Storage に答える）。落ち方、日付を同じ時刻として比べること、試しの行を除くこと。`fromCollectionChecks.spec.ts` にアクションの Supabase の場合。守りを一つずつ外すと、対応する試験が落ちる。
- `compare.mjs` の変更の前後を、生成した入力で比べ、手元の `import-verify.mjs` の出力と終了コードが一致した。

## 確かめていないこと

- 実際の Supabase のプロジェクトへの移し替え（`--linked`）。アカウントが要る。読み方は手元と同じコマンドに `--linked` を付けるだけ。
- エージェントがこの組み合わせで一本通すビルド。
