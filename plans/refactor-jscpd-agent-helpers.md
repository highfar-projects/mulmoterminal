# refactor: jscpd 重複アラートのうち、エージェント間のコピペ由来のものを潰す

`duplication-scan` (jscpd 5.0.12) の `jscpd/duplicate-code` open アラート **16 件**が対象。
そのうち **6 件**を解消する。`refactor-jscpd-duplication.md` の続きで、方針も同じ:
**まとめて意味のあるものだけを潰す。偽の抽象は、消した重複より悪い。**

再現は CI と同じ引数をローカルで:

```
jscpd . --format "typescript,vue" \
  --ignore "**/node_modules/**,**/dist/**,**/*.d.ts,**/*.spec.ts" \
  --reporters console,json --output report
```

SARIF / API のアラートは**片側の位置しか持たない**ので、対の相手を知るには JSON レポータが要る
(前回と同じ。この制約は変わっていない)。

## なぜ今これが出ているか

16 件のうち 6 件が cursor / copilot 関連。この 2 エージェントは直近に追加され、**既存エージェントの
ファイルを下敷きにして書かれた**ので、同じ規則のコピーがそのまま残っていた。
`server/files/open-dir.ts` はそれとは別種で、**共有版 (`spawnOpener.ts`) が既にあるのに採用され
ていなかった**もの。`spawnOpener.ts` のヘッダ自身が「2 つのコピーは 1 つずつ直すうちにズレる」と
書いており、その予告どおりの状態だった。

## 結果: 16 alert → 10 alert

| alert | 重複 | 判断 |
|---|---|---|
| 186 | `readMcpServers` + マージループ (`antigravity-mcp` ↔ `cursor-mcp`) | `mcp-config-file.ts` に抽出 |
| 183 | `writeAtomically` (`copilot-hooks-file` ↔ `cursor-hooks-file`) | `owned-file.ts` に抽出 |
| 179 | 「自分が書いたバイト列と一致する時だけ削除する」ゲート | 同上 |
| 177 | 上記 2 ファイルの import 行 | 183/179 の副産物として消滅 |
| 175 | read-only sqlite クエリ (`copilot-sessions` ↔ `muse-session`) | `sqlite-read.ts` に抽出 |
| 172 | opener の spawn ループ (`open-dir` ↔ `spawnOpener`) | **既存の共有版を採用** |
| 181 | `handleCopilotConnection` ↔ `handleCursorConnection` | **残した**(下記) |
| 185 | spawn-copilot ↔ spawn-cursor の import 行 | **減らせない**(下記) |
| 170 | `CellLaunchForm` ↔ `LaunchPanel` の `defineEmits` | **減らせない**(下記) |
| 169 | `participateHarness.ts` 自己重複 | **残した**(下記) |
| 171, 166, 167, 162, 182, 153 | html/shapescript, declare.ts, session-routes, useTerminalConnections | **今回は対象外**(下記) |

## 直したもの

**1. `server/agents/mcp-config-file.ts` — `readMcpServers` / `mergeOurMcpServers`**
`readMcpServers` は agy と cursor で**バイト単位で同一**だった。マージループも、
「ユーザーの entry は触らず、自分の id だけ入れ替える」規則が同じで、違うのは entry の**形**だけ
(agy は `env`、cursor は argv — `cursor-mcp.ts` に実測の理由がある)。そこを `serverFor` コール
バックにして、規則の側を共有した。`OUR_GUI_SERVER_IDS` と `assignOwn` は元のまま。

**2. `server/agents/owned-file.ts` — `writeAtomically` / `createPublishedFiles`**
copilot と cursor はどちらも**ユーザーのホームにファイルを publish し、終了時に消す**。消す方は
この 2 ファイルが行う唯一の破壊的操作で、`publishedByThisProcess` (プロセスの記憶) だけがそれを
許可している。`writeAtomically` は完全一致、記録の方は module-level `Map` を
`createPublishedFiles()` に。**記録自体は共有しない** — エージェントごとに 1 つ作る。
片方の記憶がもう片方のファイルの削除を許可してはならないため。

`server/files/atomic-write.ts` の `writeFileAtomicSync` は**採用しなかった**。temp 名が uuid で
違い、**write 失敗時に temp を消さない**。ユーザーのディレクトリにゴミを残す差なので、
「副作用なし」の要件を満たさない。理由は `owned-file.ts` のコメントに書いた。

**3. `server/agents/sqlite-read.ts` — `queryReadOnlySqlite`**
copilot と muse が同じ「read-only で開く → クエリ → filter → close → 失敗は全部 `[]`」を持って
いた。`node:sqlite` の lazy import もここ 1 か所に寄る。
`copilot-sessions.ts` の `queryStore` は**`function` 宣言のまま**にした — 定義より前の行から
参照されており、巻き上げに依存しているため。

**4. `server/files/open-dir.ts` が `spawnFirstOpener` を採用**
`openDirCommands` / `OpenDirCommand` は `spawnOpener.ts` へ移した。**循環 import を作らない**ため
(`spawnOpener` → `open-dir` の向きが既にあった)。移動に伴い、それを検査していた spec を
`spawnOpener.spec.ts` にリネーム。`open-dir.spec.ts` は**ルート自体の spec** として書き直した
(元はルートを一切検査していなかった)。

## 残した / 減らせないもの

**alert 185 (spawn-copilot ↔ spawn-cursor) と 170 (`defineEmits`) — 減らせない。**
重複しているのは import 行そのもの、および `defineEmits` の前置き。
**`defineEmits` は前回 alert 102 で同じ結論**が出ている (`refactor-jscpd-duplication.md`):
コンパイラマクロなので各 `<script setup>` に literal で無いといけない。
import 行はバレル再エクスポートでしか共有できず、それは CLAUDE.md が禁じている。

**alert 181 (`handleCopilotConnection` ↔ `handleCursorConnection`) — 残した。**
似ているが、cursor は `?gui=` を**片方の意味でしか読まない**ことがコメントに明記されている
(`activityHookEffects("Stop", active)` の都合で、view の意味だけ要る)。統合すると、その意図的な
差を消すか、分岐を足して読みにくくするかのどちらかになる。挙動が変わりうるので別扱い。

**alert 169 (`participateHarness.ts`) — 残した。**
jscpd が一致と見ているのは大部分が**コメント塊**で、実コードの重なりは `set` / `update` / `delete`
の数行。しかも 2 つの mock は**意図的に違う** (片方は Firestore の可変長 `update` を扱う)。

**alert 171 / 166 / 167 / 162 / 182 / 153 — 実質的な重複だが今回は対象外。**
html↔shapescript の dispatch、`declare.ts` の init/fork、session-routes の 2 件、
useTerminalConnections の socket ガード。いずれも本物だが、routes と UI に範囲が広がり、
`declare.ts` は**ユーザーに見せる失敗メッセージの散文**を参数化することになる。
「1 機能 1 PR」に従って別 PR にする。

## 検証

**「挙動が同じ」は実行して証明した** (CLAUDE.md / `/refactor-safely`)。旧コードを git から
逐語コピーした使い捨てハーネスを書き、生成入力で新旧を突き合わせてから削除した:

| 対象 | 比較数 | 変異テスト |
|---|---|---|
| MCP マージ + 読み込み | 8,596 | 7 中 5 検出。残り 2 は**到達不能と証明** (`JSON.parse` は prototype 連結オブジェクトを返さないので `hasOwnProperty` と `in` は実入力で差が出ない) |
| `writeAtomically` + 削除ゲート | 46 | **既存 spec が 9/9 検出** |
| `/api/open-dir` ルート | 38 | 5/5 検出 |
| sqlite (差分ハーネスなし) | — | **既存 spec が 5/5 検出** (params 欠落 / filter 除去 / 再 throw / readOnly:false / close 省略) |

ハーネスは消え、**generator と property は恒久 spec として残した**:
`test/server/agents/mcp-config-file.spec.ts` (16) と `test/server/files/open-dir.spec.ts` (6)。

**差分ハーネスの限界を 1 件実測した。** WSL 分岐は、旧実装と新実装が**どちらも同じ理由で実行
できず**一致と出ていた (非 WSL ホストには `wslpath` が無い)。等価性は正しさではない。
`toWindowsPath` だけを `vi.mock` し、`onPlatform()` で platform を両方向に固定して塞いだ。

- `yarn format` / `lint` / `typecheck` / `build` すべて緑。
- `yarn test` **12,911 passed / 0 failed**(`origin/main` をマージした後の木で計測)。
  (実行途中 load average 85 の時に 2 件落ちたが、標準実行し直して 17/17 green。機械側。)
- `/codex-cross-review` を tier C で 2 ラウンド実施し **LGTM**。10 軸すべて no findings。
