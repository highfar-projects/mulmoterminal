# fix(server): サーバ自身が `::1` も serve する (#1893)

> 時系列のログであって現状の仕様書ではない。数値は必ず sha に紐づけて書く。

## なぜ

#1889 で、ブラウザに渡す URL を `http://localhost:<port>` に戻した。`localStorage` は origin 単位
なので、この URL は**利用者の状態が filed されている名前**であって変えられない。

`localhost` は `::1` と `127.0.0.1` の両方に解決する。既定構成でサーバが bind するのは
`127.0.0.1` だけなので、`[::1]:<port>` は誰でも取れる。

**実測（2026-08-28、Chrome 152 / macOS 26.5.1 arm64）** —— 同じ port の `127.0.0.1` に `OURS-v4`、
`::1` に `STRANGER-v6` を立て `http://localhost:<port>` を開く:

```
Chrome  http://localhost:39221 -> STRANGER-v6
```

**Chrome は `::1` を優先する。** 取り合いに負けうる、ではなく、居れば必ずそちらが選ばれる。
そのページは `localhost` origin なので、MulmoTerminal の `grid_v2` / `theme` /
`remoteHost.session` を読める。

#1891 は launcher 側で spawn 前に 1 回 `canBind(port, "::1")` を撃つところまでやった。塞がって
いるのは**起動時点で既に居る**ケースだけで、probe 後に取られる窓はセッション中ずっと開いている。
Codex と CodeRabbit が独立に同じ点を指摘し、どちらも「サーバが `::1` を持て」と言った。

## 何を変えるか

`server/infra/loopback-listener.ts` は「`127.0.0.1` を serve すべきか」1 問だけを扱っていた。
**問いが 2 つになる**ので、プランを 1 個から**リスト**にする。

| プラン | なぜ要るか | 落ちたときに壊れるもの |
|---|---|---|
| `127.0.0.1` | ローカルの caller 8 箇所が literal で dial する（#1834） | hooks と GUI MCP が届かない |
| `::1` | ブラウザが `localhost` を引き、Chrome は `::1` を優先する（#1889） | 他人が origin を取れる |

**壊れ方が違うので警告文も違う。** 同じ文言を使い回すと、片方の症状を見た人がもう片方の説明を
読むことになる。だからプランは自分の理由を持ち、警告はそこから引く。

`inUseIsFine` は v4 プランだけ true になりうる（primary が `::` のとき、dual-stack が既に
`127.0.0.1:P` を握っているので EADDRINUSE は「もう覆われている」証拠）。**v6 プランでは常に
false** —— primary が `::` / `::1` ならそもそもプランを出さないので、EADDRINUSE は他人しかない。

`server/index.ts` は spare を 2 本作り、listener タプルは 3 本になる
（`createPubSub` と `mountTerminalWebSockets` が受ける `readonly [HttpServer, ...HttpServer[]]`
はそのまま満たす）。

## 変えないこと

- **best effort のまま。** bind に失敗しても致命的にしない。IPv6 の無いマシンは
  `EADDRNOTAVAIL` になるが、そこでは `localhost` は v4 のみなので実害が無い。
- **launcher の pre-spawn probe（#1891）は残す。** 起動時点で既に他人が居るケースは、サーバが
  listen を試みるより前に URL の選択で答える必要がある。両者は別の瞬間を守る。
- **shutdown は触らない。** `installShutdownHandlers` は `process.exit(0)` で終わるので、ソケットは
  OS が閉じる。listener が 2 本でも 3 本でも同じ（実機で port 解放を確認する）。

## 検証

ツリー: `8a2b6753`（origin/main）+ 本変更。すべて実 exit code を取得。

**ゲート** —— `format` / `lint` / `typecheck` / `build` / `test` すべて exit **0**。
`yarn test` は **11585 passed / 50 skipped**。

**break-verify**（各回のあと `diff -q` で byte-identical を確認）

| ミューテーション | 結果 |
|---|---|
| v6 プランを一切出さない（= #1893 以前の挙動） | 11 red |
| `::1` の `inUseIsFine` を true にする | 2 red |
| 警告文を v4/v6 で共用にする | 5 red |
| `0.0.0.0` が `::1` を serve すると判定する | 2 red |

**実機 —— bind マトリクス**（scratch HOME、`--no-open`。curl の HTTP status が ground truth で、
ログではない）

| `MULMOTERMINAL_HOST` | `127.0.0.1` | `[::1]` | `localhost` | 追加で listen したもの |
|---|---|---|---|---|
| 未設定（既定） | 200 | 200 | 200 | `::1` |
| `0.0.0.0` | 200 | 200 | 200 | `::1` |
| `::` | 200 | 200 | 200 | `127.0.0.1` |
| `::1` | 200 | 200 | 200 | `127.0.0.1` |
| `192.168.11.12` | 200 | 200 | 200 | `127.0.0.1` と `::1` の**両方** |

LAN の case は 1 度目に `ipconfig getifaddr en0` が空を返して**実質未実行**だった（`MULMOTERMINAL_HOST=""`
は既定に落ちる）。`en1` から取り直して再実行した結果が上の行。

**shutdown** —— 各 case で kill 後に `127.0.0.1` が `000`。`installShutdownHandlers` は
`process.exit(0)` で終わり、ソケットは OS が閉じるので listener が 3 本でも同じ。

**穴が閉じたことの証明** —— サーバ稼働中に別プロセスが `[::1]:34724` を取ろうとする:

```
stranger REFUSED: EADDRINUSE
```

`#1891` の時点では取れていた。これが本 issue の目的。

**squatter が先に居る場合**（`[::1]:34726` を別プロセスが保持した状態で起動）

- サーバは**起動する**（`127.0.0.1` が 200）。致命的にしない設計どおり
- サーバの警告: `could not also listen on ::1:34726 (EADDRINUSE) — the browser opens
  http://localhost:<port>, which resolves here first — …`
- launcher（#1891）は独立に `→ http://127.0.0.1:34726` を開き、状態の在り処も告げる

2 層が同じ状況について食い違わずに話す。

**WebSocket が新しい listener を通ること** —— ここが HTTP 200 だけでは足りない部分。Chrome で
`http://localhost:34727` を開き、シェルを起動して `echo WS_ROUNDTRIP_OK` を実行:

- OS 側で見た接続は 3 本とも **`[::1]:34727`**（`lsof -nP -iTCP:34727 -sTCP:ESTABLISHED`）。
  つまりページも WS も新しい listener 経由
- 画面に `WS_ROUNDTRIP_OK` が返っている（スクリーンショットで確認）

> 最初 `document.body.innerText` で判定して「返っていない」と出たが、これは**判定の誤り**。
> xterm の内容はそこに現れない。画面という外部の ground truth で見直して往復を確認した。

**未検証** —— IPv6 を持たないマシン。`EADDRNOTAVAIL` の扱いは spec で固定してあるが実機は無い
（macOS では `::1` を落とせない）。そこでは `localhost` は v4 のみに解決するので、listener が
立たなくても失うものが無い、というのが設計上の主張。Windows / Linux も未実機（CI 任せ）。
