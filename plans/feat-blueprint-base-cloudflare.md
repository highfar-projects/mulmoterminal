# feat(blueprint): Cloudflare の土台（Workers + D1 + Vue） (#2555, 6a)

設計 `plans/feat-blueprint-from-collection.md`（#2480）の段階 6 の一つ目。

## 方針

- 新しい土台のパック `blueprints/cloudflare/`
  - 構成: Worker が API（`/api/*`）、D1 がデータ、同じ Worker が Vue の画面を静的に配る。
  - 工程: 仕様書 → 道具 → 雛形 → データ → API → 画面 → ログイン → 起動確認 → セキュリティ診断 → 公開（`deploy-production` と `credential` の承認）→ 引き継ぎ。
  - 報告は `.blueprint/start-here.md`（既存の web 系の土台と同じ約束）。
- 手元の確認は `wrangler dev`（Docker 不要）。判定は `yarn start --port <n>` で起動して、そこへリクエストを送る（`checks/serve.sh`）。
  - `wrangler dev` は `yarn` → `wrangler` → `workerd` → `esbuild` の木になる。親が残ると `workerd` を立て直すので、判定は起動した木をまるごと止める。
- セキュリティ診断（`checks/security.sh`）は、local の診断から公開アプリに合わない部分を外し、Worker に合わせた。
  - 外したもの: Host の許可リスト。127.0.0.1 だけで待ち受ける構成のための守りで、公開した Worker には当てはまらない。
  - 別のサイトからの変更 → 403。
  - `/` と `/api/health` の両方のヘッダー。画面のファイルは Worker を通らないので `public/_headers` で付ける。
  - 壊れた JSON → 400。Worker は JSON をルートごとに読むので、入口で一度だけ読んで断る約束にした。こうしないと、存在しないパスに送る判定は何も確かめない。
  - `.dev.vars` / `.env` が無視されていること、依存の監査、報告の形。
- 公開の判定（`checks/deploy-check.sh`）: `.blueprint/deploy-url` の https の URL が、今回のビルドの ID・健全性の応答・CSP・描画される画面を返すこと。
- 引き継ぎの判定（`checks/handover.sh`）: README に `yarn start`・`yarn deploy`・`wrangler d1 export` があり、使い始め方に公開した URL とチェックリストがあること。
- `product` の土台に `cloudflare` を足した（必須の機能の試験は local と同じ形で使う）。
- `packs.spec.ts`: `WEB_BASES` に `cloudflare` を足した（セキュリティ診断と使い始め方の約束がかかる）。診断の後に来てよい工程は、土台ごとの対応表にした。

## 手本で分かったこと（スキルに入れた）

- `compatibility_date` を新しくしすぎると、入っている Workers の実行環境が起動を拒む。入っている wrangler が対応する日付にする。
- `@cloudflare/vitest-pool-workers` は、`vitest` の特定の系統を求める。最新の `vitest` では起動しない。
- この環境では `npx wrangler` が古い Node を拾うことがある。`yarn wrangler` を使う。
- 画面のファイルは Worker を通らないので、セキュリティのヘッダーは `public/_headers` で付ける。

## 確かめたこと

- 手本の Cloudflare アプリを作業用のフォルダに作り、判定を当てた。手本の構成は Worker + D1 + Vue で、Workers の上で D1 を使う試験が通る。
  - 雛形・各領域・起動確認・セキュリティ診断の判定は、手本で通った。
  - 守りを外すと、それぞれ名指しで落ちた（`_headers` を消す、別のサイトの判定を外す、400 を返さない、例外を投げる、`.dev.vars` を無視しない）。
  - 判定を止めた後に `wrangler` の木が残らないことを確かめた。
- 試験: `cloudflareChecks.spec.ts` で次を確かめた。
  - 公開の判定: https でない URL、URL が無い、別のビルド、健全性の失敗、CSP が無い、通る場合。偽のサーバーと、決まった HTML を返す Chrome の代役を使う。
  - 引き継ぎの判定: README の 3 項目、使い始め方の URL とチェックリスト。
  - パックの試験（`packs.spec.ts`）が、新しい土台と組み合わせを自動で検査する。

## 確かめていないこと

- 実際の Cloudflare への公開（アカウントへのログインが要る）。
- エージェントがこの土台で一本通すビルド。

## 範囲外（続く PR）

- `from-collection` の Cloudflare 対応（D1 と R2 への記録の移し替えと突き合わせ）
- Supabase の土台（6b。Docker を起動して実物で確かめる）
