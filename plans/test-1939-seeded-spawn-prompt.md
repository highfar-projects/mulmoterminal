# #1939 は再現しなかった — 代わりに、再現しない理由を固定する

## 報告した内容と、実際

#1939 はこう書いた: `GridView.vue` の Settings skill ボタンが `skillSeed(skill, "claude")` と
決め打ちしているので、Launch with が Muse のとき Muse に `/mulmoterminal-theme` という
スラッシュコマンドがそのまま届く、と。

**再現しない。** サーバ側が既に正規化している。`server/routes/plugin-routes.ts` の
`spawnSeededSession` は spawner に渡す前に `codexifySkillSeed(message)` をかけ、その結果を
claude 以外の全分岐に渡す。実行して確認した:

| 入力 | 出力 |
|---|---|
| `/mulmoterminal-theme` | `Use the "mulmoterminal-theme" skill.` |
| `/mulmoterminal-theme make it warm` | `Use the "mulmoterminal-theme" skill.\n\nmake it warm` |
| `just a sentence` | `just a sentence` |

issue を書いたときクライアント側だけを追い、サーバの変換を見落としていた。`GridView` の
決め打ちは、この正規化があるおかげで無害。

## それでも入れるもの

**その正規化はテストで固定されていなかった。** `spawnSeededSession` は 5 分岐のファンアウトで、
claude 以外の各分岐が `initialPrompt`（変換後）を渡すことに依存している。新しいエージェントを
`message`（生）で足せば、#1939 の不具合がそのまま現実になる — どのテストも通らない経路で、
静かに。

`test/server/routes/seeded-spawn-prompt.spec.ts` が、実際にルートを叩いて各 spawner が
受け取った文字列を捕まえる。

- claude は `/slug` を**そのまま**受け取る（スラッシュコマンドを持つ唯一のエージェント）
- それ以外は変換後を受け取る。エージェント一覧は `TERMINAL_AGENTS` から引くので、**Agent Picker
  に足したエージェントはこの spec を落とすまで出荷できない**
- 非スラッシュのプロンプト（コレクションアクションの自然文）は全エージェントで無変更
- claude の draft は生のまま、実行されずに入力欄へ

## 検証

**guard が空振りしないことを確認済み**: muse 分岐を `initialPrompt: message` に変えると赤
（`rewrites the slash command for muse`）、戻すと緑。これを確かめないと、引数の拾い方を
間違えた spec が「常に緑」で通ってしまう。

`format` → `lint` → `typecheck` → `build` → `test`（11955 passed / 50 skipped）すべて緑。

## コードは変えない

`GridView.vue` の `skillSeed(skill, "claude")` はそのまま。動いているものを、動く理由が
テストで固定された今、書き換える理由がない。
