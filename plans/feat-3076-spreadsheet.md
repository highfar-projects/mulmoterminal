# 表計算（presentSpreadsheet）を使えるようにする（#3076）

## 目的

Claude が計算式入りの表を作り、利用者が数字を直すと再計算される道具を MulmoTerminal に入れる。予算・見積もり・返済計画・比較表のように「Claude が下書きして人が前提を変える」作業に使う。

## 方針

- `@gui-chat-plugin/spreadsheet@^3.0.0` をそのまま使う。表の保存（`artifacts/spreadsheets/YYYY/MM/<id>.json`）と、画面からの読み込み・書き戻しはパッケージ側の実装
- 画面の `dispatch` は既存の汎用ルート `/api/plugin/presentSpreadsheet` に届き、パッケージの `execute` が `kind` で振り分ける。サーバー側に専用のルートは足さない
- 登録：`plugins/plugins.json`、`src/plugins-registry.ts`（`wrapWithPluginRuntime` で runtime を渡し、画面の高さは `CANVAS_CARD_HEIGHT`）
- 道具の分類は `render`。外部への呼び出しや課金がなく、作業領域に 1 ファイル書くだけなので、自動許可の一覧（`AUTO_ALLOWED_TOOLS`）にも入れる
- 空の Canvas の案内文（`GuiPanel.vue` の `TOOL_HINTS`）と、ガイドの Canvas の道具の一覧に足す

## 確認

- `yarn format` / `yarn lint` / `yarn build` / `yarn typecheck` / 関係するテスト
- アプリを起動し、作成 → 表示 → セル編集 → ファイルへの書き戻し → 開き直し、を本物のサーバーで確かめる
