# 画面専用の `kind` をモデルの道具呼び出しから拒否する（#3080）

## 何が起きているか

MCP の仲介役（`server/mcp/broker.ts`）は、モデルの道具呼び出しの引数をそのまま `POST /api/plugin/<tool>` に送る。この入口には画面（View）の `dispatch` も届き、`kind`（`saveHtml`・`saveShape`・`saveSpreadsheet`・mulmoscript の `save` など）で画面専用の操作に振り分けられる。呼び出し元を区別していないため、モデルが道具の引数に `kind` を入れると、画面の保存などと同じ操作ができる。対象の道具（`presentHtml`・`presentShapeScript`・`presentSpreadsheet`）は `AUTO_ALLOWED_TOOLS` に入っており、グリッドのセルでは確認なしに動く。

## 方針

モデルの呼び出しが必ず通る仲介役 1 か所で止める。画面側の経路と、各プラグインの振り分けには手を入れない。

- 道具の引数に `kind` があり、その道具の定義が `kind` を宣言していなければ拒否する
- 宣言していても、`enum` に無い値なら拒否する（`google` と `manageAccounting` は `kind` を正規の引数として列挙で宣言しているので、今までどおり通る）
- 拒否は既存の `refused` と同じ扱い（`isError` で返し、呼び出し履歴にも残す）
- 判定は純粋な関数として `server/mcp/view-dispatch-kind.ts` に置き、正常・異常の両方向をテストする

## やらないこと

- 画面の `dispatch` を別の経路に移すこと（全プラグインに波及する）
- `kind` 以外の、定義に無い引数の扱い

## 確認

- 判定関数の単体テスト、仲介役の振る舞いのテスト
- `yarn format` / `yarn lint` / `yarn build` / `yarn typecheck` / 関係するテスト
- サーバーを起動し、仲介役経由の呼び出しで `kind` 付きが拒否され、画面からの `dispatch` は今までどおり通ることを確かめる
