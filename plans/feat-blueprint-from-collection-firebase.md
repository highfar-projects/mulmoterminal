# feat(blueprint): コレクションから Firebase のアプリを作り、記録をエミュレータと本番に移す (#2521)

設計 `plans/feat-blueprint-from-collection.md`（#2480）の段階 3。

## 方針

- `from-collection` の `bases` に `firebase` を足した。
  - 既存の local 用の工程（`import` / `acceptance`）には `bases: ["local"]` を付けた。付けないと Firebase の土台で差し込み先（`data`）が無く、組み立てが失敗する。
- Firebase の工程（`data-rules` の直後に、この順）
  - `import`（エミュレータ）
  - `features`（`product` のスキルを写したもの）
  - `acceptance`（同じく写したもの）
- 本番への移し替え `import-production` は `deploy-production` の直後。承認は `deploy-production` と `credential`。
  - 本番に書き込み、ユーザーのアプリケーション既定の認証情報（ADC）を使うため。サービスアカウントの鍵は使わない。
- 仕様書の判定: Firebase の土台の `spec.sh` にも、local と同じ「種類が `checks/spec.sh` を持てば走らせる」口を足した。既存の Firebase の種類（`internal`、`product`）は判定のファイルを持たないので、振る舞いは変わらない。
- 変換表に「Firebase（Firestore）」の節を足した。
  - コレクション = slug、文書 ID = 主キー、項目 = キー。
  - 日付は ISO の文字列（Timestamp にしない。元と同じ文字で突き合わせるため）。
  - `image` / `file` は既定のバケットの同じパスに置き、そのバケット名を `.blueprint/storage-bucket` に書く。
- 判定 `checks/import-firebase.sh`
  - `emulator`: エミュレータの中で `yarn import-source --target emulator` を 2 回走らせ、`firestore-verify.mjs` が REST で読む。画像があるときだけ Storage のエミュレータも起こす。
  - `prod`: 本番をユーザーのトークンで読む。バケットは `<本番の ID>.appspot.com` か `<本番の ID>.firebasestorage.app` に限る。
  - 主キーは文書 ID で照合するので、項目としては求めない。
- 突き合わせの共通部分（元の読み込み、比べる項目、値の比べ方、報告）は `checks/compare.mjs` に切り出し、local の `import-verify.mjs` もそれを使う。

## 確かめたこと

- `import-verify.mjs` の切り出しは、切り出す前の版と並べて生成した 300 通りのデータベースで、終了コードと出力がすべて一致した。
- `firestoreVerify.spec.ts`: Firestore と Storage の REST を真似るサーバーで次を確かめた。
  - 通る場合、ページ送り。
  - 文書が無い、値が違う、真偽を数で持つ、項目が無い、ファイルが無い、バケット名が無い。
  - ファイルを指さなければバケット名を求めないこと。
  - 主キーを項目として求めてしまう誤りは、この試験で見つかった。
- 実物のエミュレータ（Firestore と Storage）で、Admin SDK で約束どおりに書いた移し替えを当てた。
  - 通った。
  - 1 項目を落とすと、その記録とその項目を名指しして落ちた。
  - 画像をアップロードしないと、そのファイルを名指しして落ちた。

## 確かめていないこと

- `prod`（本物の Firebase プロジェクトが要る）。
- エージェントが実際にこの工程を通すビルド。

## 範囲外

- `money` / `table` の値の突き合わせ
- 共有アプリ（段階 4）
