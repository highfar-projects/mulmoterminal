# ヘッダーのガイドを入門とリファレンスに分け、実装に合わせて埋める

Issue: #1928

## 背景

`docs/guide/{ja,en}/header.md` は 318 / 320 行あり、**読み方の違う 2 種類が 1 ページに同居**していた。
前半（§1〜4）は「1 個作ってみる」ための手順で上から読むもの、後半（§5〜8）は「書くときに引く」もの。
後者に用があるたびに前者をスクロールで通過する必要があった。

あわせて、実装（`server/config/header-resolve.ts`）にあってドキュメントに無い挙動が 4 つあった。

## 分割

| ページ | 章 | 読み方 |
|---|---|---|
| `header.md`（残す） | 1 ヘッダーを読む / 2 最初のボタン / 3 アイコン / 4 `run` の 4 種類 / **5 リファレンスへの導線（新設）** | 上から読む |
| `header-reference.md`（新規） | 1 `${変数}` / 2 `when` / 3 並び順とマージ / 4 チップ / 5 Skill メニュー / **6 レシピ集（新規）** | 引く |

- アンカーは移設先で**同じ slug のまま**にした（`#vars` `#when` `#order-merge` `#chips` `#builtin-chips`
  `#custom-chips` `#skills`）。外から張られていた `header.html#builtin-chips`（ja/en の worktree.md）は
  ページ名だけを差し替えれば済む。
- `nav_order` は新ページを 11 に入れ、以降を 1 つずつ繰り下げた（ja: 12〜18、en: 12〜19）。
  リリースページ側は 999xxxx 台なので衝突しない。

## 実装に合わせて足した 4 つ

1. **`when` の記法が半分しか書かれていなかった。** `!isGitRepo` / `key != value` /
   **右辺を空にする `repo != `**（＝「解決できる値がある」）/ **括弧は使えない** を追加。
   括弧はエラーにならず、`(isGitRepo` が未知の語として false になり**黙って消える**ので、
   書いておかないと気づけない。
2. **`repo != ` が実用上いちばん効く。** GitHub を開くボタンを `isGitRepo` で出し分けると、
   remote が無いリポジトリや GitHub 以外の remote でもボタンが出て `https://github.com/` という
   死んだリンクになる。「git リポジトリか」と「repo 名が取れるか」は別の質問である、という節を作った。
   GitLab では `${repo}` が `host/owner/repo` になる（`server/git/forge-support.ts`）ことも明記した。
3. **未知の `${変数}` はリテラルで残る**（`header-resolve.ts:33` の意図的な設計）。`when` は逆に
   fail closed で消える。この非対称を「表示は間違いが見える側に、条件は安全な側に」として書いた。
4. **変数 12 個の表**（issue は 13 個としているが、`varValue` のテーブルは 12 個）。
   意味・例・**空になる条件**の 3 列。`ahead` / `behind` / `dirty` は数値なので**空にならない**
   （`0` になる）ことが `!= ` の使い分けに効くので明示した。`isGitRepo` は変数ではない、も。

## レシピ集

「全部入りの `.mulmoterminal.json`」がどこにも無かったので新設した。プロジェクト用の全部入り、
global とプロジェクトへの分け方、`!isGitRepo` 用、worktree 用の 4 本。

## 検証

- **設定サンプルは実バリデータを通した。** 追加した全 JSON ブロックを `loadDirConfig` に通し、
  ボタン / チップが 1 件も落ちないこと、`resolveHeader` の結果（`gh` の URL が
  `https://github.com/acme/api` になること）を確認。さらに配布している JSON Schema
  （`dirConfigJsonSchema()`）にも通した。
- **回帰させないよう CI に載せた。** `test/server/config/doc-button-samples.spec.ts` の `FILES` に
  `header.md` × 2 と `header-reference.md` × 2 を追加（従来は config.md と SKILL.md だけだった）。
- **`when` / `substitute` の記述はすべて実装で実行して確かめた**（`agent == "claude"` は false、
  `repo != ` と `repo !=` は同値、括弧付きは false、`${braneh}` はリテラル、など）。
- **Jekyll でビルド**し、新ページが生成されること・サイドバーが header の直後に並ぶこと・
  インラインコードの `repo != ` の末尾スペースが HTML に残ることを確認。
- 内部リンクを全数チェックし、ページとアンカーがすべて解決することを確認。

## やらなかったこと

- `server/skills/mulmoterminal-header` のチップ一覧が 8 個（`env` 欠落）で古い件は、issue が
  「別途直したい」としているので触っていない。
