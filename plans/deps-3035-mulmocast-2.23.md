# deps: mulmocast 2.23 と @mulmoclaude/mulmoscript-plugin 5.5 (#3035)

## 変えるもの

| パッケージ | 前 | 後 |
| --- | --- | --- |
| `mulmocast` | ^2.21.0 | ^2.23.0 |
| `@mulmoclaude/mulmoscript-plugin` | ^5.3.0 | ^5.5.0 |

`jinglescript` / `@gui-chat-plugin/jinglescript` は #3032 で 0.8 になっている。lockfile では
jinglescript は 0.8.0 の一つだけで、mulmocast もそれを使う。

## 決めたこと

- avatar（`avatarscript` ^0.5 と `onnxruntime-node`）は依存に入れない。入れた人だけ使える扱い
  （MulmoClaude と同じ）。入っていなければ mulmocast が入れ方のヒント付きのエラーを出す
  （`lib/actions/avatar.js` の `INSTALL_HINT`）。入れ方の案内は、実際に入れて動くことを確かめてから別に書く。
- `@mulmoclaude/common` の peer の警告は、ほかのプラグインにも出ている以前からのもの。5.5.0 が
  それを読むのは型定義（`dist/server/types.d.ts`）だけ。

## 確かめ方

- `node_modules` を消して `yarn install --frozen-lockfile` からやり直し、lint・typecheck・build・test
- デモのサーバーで、stories に置いた MulmoScript（テキストスライド・Markdown・Mermaid）を Files ペインの
  Canvas 表示で開き、描画とコンソールエラーが無いことを見る。デモのサーバーは `HOME` と `TMPDIR` の両方を
  デモ専用にする（`TMPDIR` を分けないと、起動時の後片付けが本物のセッションのドロップ用ディレクトリを消す）
