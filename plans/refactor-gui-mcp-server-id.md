# refactor: 単一ビューの GUI MCP サーバー ID を `mt` に短縮する

## きっかけ

「`presentChart` という MCP が、実際には `mcp-mulmoterminal_gui-presentChart` という長い名前に
なるのはなぜか。短くできるか」という質問。

## 何が起きていたか

ツール名はクライアントが**サーバー ID で必ず修飾する**。

| クライアント | 形 | 例 |
| --- | --- | --- |
| Claude Code | `mcp__<id>__<tool>` | `mcp__mulmoterminal-gui__presentChart` |
| Codex | `mcp-<id>-<tool>`（ID 内の `-` は `_` に正規化） | `mcp-mulmoterminal_gui-presentChart` |

つまり ID の長さは**ツール 1 個につき 1 回、リスト表示のたびに、セッションが終わるまで**払う。
`mulmoterminal-gui` は 17 文字を使って、周囲の設定がすでに言っていることを繰り返していた。

## ID は 2 つあり、所有者が違う

ここが判断の分かれ目で、最初は「`mulmoterminal-render` も壊れる」と誤って説明した。実際は独立している。

| | workspace セル / 単一ビュー | project ディレクトリのグリッドセル |
| --- | --- | --- |
| 配送 | spawn ごとに生成する `--mcp-config` / `-c mcp_servers.<id>.url=` | ユーザー自身の `.mcp.json`、`claude mcp add -s local` |
| ID | `GUI_SERVER_ID` | `toolGroupServerId()` = `mulmoterminal-<group>` |
| 所有者 | **こちら**（ディスク上のどのファイルにも残らない） | **ユーザー**（設定ファイルのキーそのもの） |

分岐は `server/session/spawn-claude.ts` の `carriesFullGuiMcp()`。

したがって:

- `GUI_SERVER_ID` は自由に改名できる → `mt` に短縮した。
- グループ ID は改名すると、既に書かれた `.mcp.json` がエラーなしで静かに効かなくなる。ランチャーの
  グループ切り替えも同じ ID を読み戻し、セットアップガイドにも載っている。**やるなら移行処理が必要**で、
  今回のスコープ外。**触っていない。**

## やったこと

1. **定数を `common/toolGroups.ts` に集約。** それまで 4 箇所にリテラル／別名定数として散っていた
   （`mcp-config.ts` のローカル定数、`plugins-registry.ts` の `MCP_SERVER_NAME`、`broker.ts` の直書き、
   `index.ts` の `allowedTools` 文字列）。散っていたこと自体が、改名を実際より怖く見せていた。
2. **`LEGACY_GUI_SERVER_IDS` を追加。** 旧 ID を認識し続ける必要がある 2 箇所のため:
   - `app-config.ts` の `RESERVED_MCP_IDS` — 古いセッションが今も書きうる ID をユーザーに奪わせない
   - `antigravity-mcp.ts` の `OUR_SERVER_IDS` — 自分が書いたエントリを ID で消す処理。落とすと
     `.agents/mcp_config.json` に `mulmoterminal-gui` が永久に残る
3. **非対称性を明文化。** 同じツールが workspace セルでは `mcp__mt__presentChart`、project セルでは
   `mcp__mulmoterminal-render__presentChart` になる。**知らないとバグに見える**ので、README に表付きの
   節、両定数に相互参照コメント、`carriesFullGuiMcp` の doc に「これが差の原因」、CLAUDE.md に
   「統一するな／グループ ID を短縮するな」というルールを置いた。

## 検証

`yarn typecheck` / `format` / `lint`（0 errors）/ `yarn test` 7722 passed。
`test/common/toolGroups.spec.ts` に 2 本追加 — ID が短いことと全グループ ID と衝突しないこと、
旧 ID を消していないこと。

## 残り

- 既存セッションは旧 ID の `--mcp-config` を持ったまま走っている。新しい名前になるのは次の spawn から。
- グループ ID 側の短縮（`mt-render` など）は未着手。やるなら既存の per-folder 設定を書き換える移行が要る。
