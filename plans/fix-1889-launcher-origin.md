# fix(cli): ブラウザに渡す URL を `localhost` に戻す (#1889)

> 時系列のログであって現状の仕様書ではない。数値は必ず sha に紐づけて書く。

## 症状（observed）

4.10.1 でグリッドにセッションを並べた環境を、同じ port のまま 4.11.0 で起動すると
**グリッドが空で立ち上がる**。tmux のセッションは全部生きているが、どのセルがどのセッション
だったかを憶えているのはブラウザだけなので何も戻らない。エラーは出ない。

`http://localhost:<port>` を手で開き直すと以前のグリッドがそのまま出てくる。状態は消えていない。

## 原因

グリッドの配置は `localStorage` の `grid_v2` にしかない（`src/components/gridTabs.ts:77`、
読み書きは `src/components/GridView.vue:92,94`）。**`localStorage` は origin 単位**なので、
開く URL のホスト名が変われば別の引き出しになる。

git で確定した変更点:

| version | ブラウザに渡す URL |
|---|---|
| 4.10.1 | `bin/mulmoterminal.js:352` … `const url = \`http://localhost:${port}\`;` |
| 4.11.0 | `launcherUrl(reachHost, port)` → 既定 bind `127.0.0.1` なので `http://127.0.0.1:<port>` |

`launcherUrl` は PR #1877（issue #1876）で入った。

## これは #1876 の修正ではない

#1876 の報告された不具合は **二重起動ガードが既定構成で発火しない** こと ——
`isPortFree` が `::` を probe するのにサーバは `127.0.0.1` に bind し、bind は同一アドレスと
しか衝突しないので稼働中インスタンスを検出できない。修正の核は `probe.listen(port, BIND_HOST)`。

表示 URL を変えたのは**レビュー由来の追加**で、PR #1877 の変更表がそう書いている:

> **readiness チェックと表示 URL も同じアドレスに従わせる**（gh-review-loop iter-2/3 で追加）

したがって **URL だけ戻しても #1876 は再発しない**。probe・readiness ポーリング・IPC による
bind アドレス報告は #1877 のまま一切触らない。

## 戻して再び受け入れる risk と、その大きさ

`launcherUrl` のコメントが挙げている懸念はこれ:

> `localhost` resolves to BOTH `::1` and `127.0.0.1`, so the browser may open the very process
> the poll was written to avoid.

実体を切り分けると:

- **MulmoTerminal の 2 個目は該当しない** —— `companionHostsFor` が全 bind で `127.0.0.1` を
  必須 probe するので spawn 前に弾かれる（#1877 のこの部分は戻さない）
- 残るのは「**別アプリ**が同じ port を `::1` だけで掴んでいる」場合のみ
- 起きても他人のページが表示されるだけ。ready バナーの検証自体は実 bind アドレスに対して行う
  （`waitUntilReady({ host: reachHost })` は変えない）
- **4.10.1 以前は何ヶ月もこの挙動で、報告はゼロ**

対して失うものは、アップグレードした利用者**全員**のグリッド配置。observed で、いま起きている。

## `localhost` の到達性は #1834 が保証している

`server/infra/loopback-listener.ts` の設計により、サーバは**必ず `127.0.0.1` を serve する** ——
primary の bind がそれか、`MULMOTERMINAL_HOST` を広げたときは二次 listener が付く。同ファイルの
コメントが「`localhost` と書く caller は v6 が refuse したら v4 に落ちて届く」と明言している。
LAN bind (`192.168.x.x`)・`::1`・`127.0.0.2` のいずれでも `http://localhost:<port>` は届く。

## issue の「本命」案（隠し iframe での移行）は不可能 —— 実測

Chrome 152（`Google Chrome for Testing`、puppeteer 25.8.0）で計測:

| 読み方 | 結果 |
|---|---|
| `localhost` をトップレベルで開く | `{"grid_v2":"FROM_OLD_ORIGIN"}` |
| `127.0.0.1` の中に `localhost` の iframe | `{}` |
| 同上 + `document.requestStorageAccess()` = **granted** | `{}` のまま |

third-party storage partitioning は localStorage にも効き、Storage Access API は cookie 用なので
解放されない。**旧 origin に触る手段はそのオリジンをトップレベルで開くことだけ**。
だから「戻す」以外の選択肢は、どれも利用者に一手を要求する。

## 4.11.0 の公開は 4 時間前

`npm view mulmoterminal time` → `4.11.0: 2026-08-28T04:29:30.892Z`（確認時刻 2026-08-28T08:29Z）。
新 origin に状態が溜まる前なので、戻すだけで被害者は自動的に元へ戻る。移行 UI もサーバ側の
受け渡しも要らない。**急ぐ理由もここにある** —— 待つほど `127.0.0.1` 側に溜まる。

## 変更

`bin/cli-args.js`

- `browserUrl(port)` を追加 —— ブラウザに渡す URL。常に `http://localhost:<port>`。
  「正しいアドレス」ではなく「**変えてはいけない識別子**」を返す関数として分ける。
- `launcherUrl(reachHost, port)` はそのまま残す —— 検証したアドレスを名指しする用途。

`bin/mulmoterminal.js`

- `beginReady` が open/print に `browserUrl(port)` を使う。`waitUntilReady` の `host` は
  `reachHost` のまま（変更なし）。
- bind が loopback でないときだけ、検証したアドレスを 1 行足す。LAN 運用者が 4.11.0 で得た
  情報を失わないため。

## 検証

ツリー: `4bc15da1`（origin/main）+ 本変更。すべて pipe 越しではなく実 exit code を取得。

**ゲート** —— `format` / `lint` / `typecheck` / `build` / `test` すべて exit **0**。
`yarn test` は **11520 passed / 50 skipped**。

> lint は最初 43 errors だったが、**node_modules が 4.10.1 当時のままだったのが原因**
> （`mulmocast` 未インストール → "type that could not be resolved"）。`yarn install` 後は 0。
> 42 件は既存ファイル側で、stash した状態でも同じものが出ることを確認済み。
> 自分の変更由来だったのは 1 件 —— `runServer` が 62 行になり `max-lines-per-function` 超過。
> `announceReady` を module level に抽出して解消（eslint-disable は使っていない）。

**break-verify**（各回のあと `diff -q` でバックアップと byte-identical を確認）

| ミューテーション | 結果 |
|---|---|
| `browserUrl` を `launcherUrl("127.0.0.1", port)` に戻す（= 4.11.0 の不具合） | 2 red |
| `boundAddressNote` の loopback 早期 return を削る | 1 red |

**実機**（scratch HOME、`--no-open`、実ブラウザは puppeteer 25.8.0 / Chrome 152）

| 条件 | バナーの URL | 追加行 | 結果 |
|---|---|---|---|
| 既定 bind（`127.0.0.1`）, port 34688 | `http://localhost:34688` | なし | ✓ |
| 同 port で 2 個目（レジストリ空の別 HOME） | —— | —— | `Port 34688 is already in use.` / exit 1、**`Starting...` も偽 ready バナーも無し**（#1876 非再発） |
| `MULMOTERMINAL_HOST=192.168.11.12`, port 34689 | `http://localhost:34689` | `Bound to 192.168.11.12 — reachable from another machine at http://192.168.11.12:34689` | ✓ |
| `MULMOTERMINAL_HOST=::1`, port 34690 | `http://localhost:34690` | なし | ✓ |

**`localhost` の到達性**（#1834 の二次 listener が効いていることの実測）—— curl の HTTP status:

| bind | `localhost` | `127.0.0.1` | 実 bind アドレス |
|---|---|---|---|
| `192.168.11.12` | 200 | 200 | 200 |
| `::1` | 200 | 200 | 200 |

**ブラウザ**（Chrome 152 で実際に読み込み）

| origin | status | mount | localStorage | console error |
|---|---|---|---|---|
| `http://localhost:34688` | 200 | ✓ | writable | 0 |
| `http://127.0.0.1:34688` | 200 | ✓ | writable | 0 |

**未検証** —— Windows / Linux での挙動は実機確認していない（macOS 26.5.1 arm64 のみ）。
ただし変更は URL 文字列の組み立てのみで、probe / bind / poll のプラットフォーム依存部分は
触っていない。`localhost` の到達性は #1834 の二次 listener に依存し、そちらは既存の仕組み。
