# feat(blueprint): Supabase の土台（Postgres + 行ごとの権限 + Vue） (#2555, 6b)

設計 `plans/feat-blueprint-from-collection.md`（#2480）の段階 6 の二つ目の土台。`from-collection` の Supabase 対応は続く PR。

## 方針

- 新しい土台のパック `blueprints/supabase/`
  - 構成: データ・ログイン・権限は Supabase（Postgres、Auth、行ごとの権限 RLS）。Vue の画面はブラウザから Supabase を直接読み書きする。
  - 画面の置き場所: Supabase は Web ページを公開する場所を持たない（Storage の HTML はテキストとして返る）。ユーザーに確かめ、Cloudflare の静的配信（Worker のコードなし）にした。公開の判定は 6a の仕組みを流用できる。
  - 工程: 仕様書 → 道具 → 雛形 → データと権限 → 画面 → ログイン → 起動確認 → セキュリティ診断 → 公開（`deploy-production` と `credential`）→ 引き継ぎ。
  - API の工程はない。守りはすべて Postgres の中（RLS・制約・関数）に置く。
- 手元の確認: Docker の中の Supabase 一式（`supabase start`）。判定は `yarn db:start` で起動し、`supabase db reset` でマイグレーションと試しのデータに戻してから試験する。
- 画面の CSP: `connect-src` に、そのビルドが話す Supabase の URL を入れる必要がある。手元と本番で URL が違うので、`_headers` はビルドのときに `VITE_SUPABASE_URL` から書く。
- セキュリティ診断（`checks/security.sh`）
  - Supabase 自身の診断: `supabase db advisors --type security --fail-on warn`。
  - 他人としての読み書き（`checks/security-probe.mjs`）: public の表ごとに、ログインしていない人と、何も持たないログインした人が試す。
    - 試しのデータの行を読む、空の行を足す、同じ値で変える、消す。
    - 持ち主の方針が見分けられるのは「行の持ち主」と「自分」の 2 人だけなので、書き込みは利用者を指す列（`auth.users` への外部キー、または既定値が `auth.uid()`）をその両方にして試す。
      - 行を足すのは、空の行と、試しの行の値を写した行の両方で試す（実際にありそうな値でだけ開く方針にも届くように）。
      - 試しの行の値を写した行を、試しの行の持ち主の名前で足す。
      - 試しの行を、利用者を指す列を全部自分にして変える（持ち主の乗っ取り）。成否は応答ではなく秘密の鍵で読み直して見て、行は元に戻す。
    - 通ったものは、`.blueprint/public-access.json`（誰が・何を・理由。ほかの利用者の名前で足すものは列も）に書いたものだけ許す。
    - 試せないものは試験で確かめる。持ち主が自分の行を他人の名前に移すこと（試す人は何も持たない）と、試しのデータに無い値でだけ開く方針。
  - 表示された画面のヘッダーと、`dist/` に秘密の鍵（`sb_secret_…`、`service_role` の JWT）が無いこと（`checks/client-secrets.mjs`）。
  - `.env` と `.env*.local` が無視されていること、依存の監査、報告の形。
- 公開の判定（`checks/deploy-check.sh`）
  - ページの確認: 公開した URL が今回のビルドを配っていること。CSP が本番の Supabase への接続を許し、ほかの Supabase（`*.supabase.co` のような書き方も含む）を許していないこと。公開されたスクリプトが本番の Supabase を指し、手元の Supabase もほかの Supabase も指さず、秘密の鍵を含まないこと。画面が描画されること。
  - 本番の Supabase の確認（`checks/migrations-applied.mjs`）: 本番が当てたマイグレーションが、`supabase/migrations/` と過不足なく一致すること。一致は、版ごとの文で比べる。手元のデータベースをファイルから作り直し、CLI が記録した文と、本番が記録した文を比べる（両方とも同じ CLI が分けた文）。本番に当てた後にファイルを書き換えると、`db push` はその版をもう当てないので、ここで見つかる。あわせて、Supabase の診断が何も出さないこと。
- `product` の土台に `supabase` を足し、必須の機能の試験（`acceptance-supabase`）を手元の Supabase に当てる形で足した。
- `packs.spec.ts` の `WEB_BASES` に `supabase` を足した。

## 手本で分かったこと（スキルと判定に入れた）

- 空の表は、RLS が無くてもログインしていない人に `[]` を返す。読みの判定には試しのデータが要る。
- 足す判定で行を返させる（`Prefer: return=representation`）と、読みの方針でも判定される。読めない人の挿入は通っても `42501` で断られたように見える。判定は `return=minimal` で送る。
- RLS の判定は NOT NULL より先に行われる。空の行を足して `42501` なら RLS が断っている。それ以外（`23502` など）なら RLS を通った。
- `auth.users` に直接入れた試しの利用者は、`confirmation_token` などが NULL だと、ログインが 500 になる。空の文字列にする。
- `supabase db query` は一度に一つの文だけ実行する。
- `supabase projects api-keys` は、`--reveal` を付けない限り秘密の鍵を隠す。`db push` は、`--include-seed` を付けない限り試しのデータを送らない。
- `supabase link` はデータベースのパスワードを聞くので、本人に実行してもらう。

## 確かめたこと

- 実物で確かめた: 手本のアプリ（本の一覧。持ち主だけが読み書きできる）を作業用のフォルダに作り、手元の Supabase 一式（Docker）に当てた。
  - 道具・雛形・試験・起動確認・セキュリティ診断の判定は、手本で通った。
  - 壊すと、それぞれ名指しで落ちた: 秘密の鍵を画面に入れる、`service_role` の JWT を画面に入れる、`frame-ancestors` を外す、RLS を切る、誰にでも読ませる方針、`.env.development.local` を無視しない、報告の欠け、HIGH を残す。
  - 他人としての読み書きの判定: RLS の誤りの典型を一つずつ入れて確かめた。読み、変える、消すを `using (true)` にしたもの、ログインしていない人に足させるもの、RLS を切ったもの、主キーの無い表、試しのデータの無い表。どれも名指しで落ちた。
- 実ブラウザで確かめた（ヘッドレス Chrome を DevTools プロトコルで操作）: 試しの利用者でログインすると、持ち主の本だけが一覧に出た。CSP から Supabase の URL を外すと、ログインが CSP に止められることも確かめた。起動確認の判定も、この壊し方で落ちる。
- 試験（`supabaseChecks.spec.ts`）: CI には Docker が無いので、代わりの Supabase CLI と、手元の Supabase と同じ答え方をする代わりのサーバーで、判定そのものを確かめる。
  - 他人としての読み書き: 各操作と各利用者の組み合わせ、行を返させる挿入、宣言の検査。
  - その他: 診断、マイグレーション、秘密の鍵、公開の判定の各落ち方、引き継ぎ。
  - 判定の守りを一つずつ外すと、対応する試験が落ちる。

## 確かめていないこと

- 実際の Supabase のプロジェクトと Cloudflare への公開（アカウントへのログインが要る）。
  - 公開の判定のうち `--linked` で本番を読む部分は、手元の `--local` と同じコマンドの同じ出力の形を前提にしている。
- エージェントがこの土台で一本通すビルド。

## 範囲外（続く PR）

- `from-collection` の Supabase 対応（記録を Postgres に、画像・ファイルを Storage に移して突き合わせる）
