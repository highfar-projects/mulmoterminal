# fix(server): サーバ自身が `::1` も serve する (#1893)

> 時系列のログであって現状の仕様書ではない。数値は必ず sha に紐づけて書く。

## なぜ

#1889 で、ブラウザに渡す URL を `http://localhost:<port>` に戻した。`localStorage` は origin 単位
なので、この URL は**利用者の状態が filed されている名前**であって変えられない。

`localhost` は `::1` と `127.0.0.1` の両方に解決する。既定構成でサーバが bind するのは
`127.0.0.1` だけなので、`[::1]:<port>` は誰でも取れる。

**実測（2026-08-28、Chrome 152 / macOS 26.5.1 arm64）** —— 同じ port の `127.0.0.1` に `OURS-v4`、
`::1` に `STRANGER-v6` を立て `http://localhost:<port>` を開く:

```text
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

```text
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

## レビュー iter-1 —— 「先に名乗って、あとから bind していた」

CodeRabbit: 指摘なし。Codex: 1 回目 `LGTM`、同じ head で再実行したら
`CHANGES REQUESTED`（同一コードで割れた）。内容は正しかった。

> `server/index.ts`: startup publishes the `listening` IPC event before it requests the required
> `::1` bind, leaving the localhost-origin takeover race open.

**そのとおりだった。** `process.send({type:"listening"})` が `startLoopbackListeners` より前に
あった。launcher はこのメッセージで banner を出しブラウザを開くので、**まだ我々のものでない
アドレスへ招待していた**ことになる。「timing ではなく construction で所有する」という本 PR の
主張が、その一点で成立していなかった。

### 直し方 —— 2 つある

**1. bind が済んでから名乗る。** `startLoopbackListeners` を await 可能にし、announcement は
その後。`listen()` は `listening` か `error` のどちらか一方を必ず返す（第三の結末が無い）ので
timeout は置かない —— マイクロ秒で終わるローカル syscall に上限秒数を決める根拠が無く、切れた
ときにカーネルが今まさに返そうとしている答えを推測することしかできない。

**2. 結果を launcher に伝える。** これが無いと 1 だけでは足りない。launcher の `::1` probe は
**この process が存在する前**に走るので、**起動中に**横取りする相手を見られない。そこで
`listening` メッセージに `v6LoopbackServed` を載せ、launcher は自分の probe と child の報告の
**両方**が肯定したときだけ `localhost` を使う。フィールドが無い（古い child）ときは `undefined`
で、probe だけの判断に戻る —— 「言わなかった」と「取れなかった」を別の答えとして保つため。

`server/index.ts` が 600 行の上限を超えたので、announcement は
`server/infra/announce-listening.ts` に切り出した。**順序が意味を持つコードを boot script に
置いておくと、整理のつもりで動かされる。** 独立モジュールなら 2 手順と理由が 1 か所にある。

### iter-1 の検証

| ミューテーション | 結果 |
|---|---|
| bind を待たずに名乗る（= 指摘された挙動） | 2 red |
| `v6LoopbackServed` を常に true にする | 1 red |
| parent が disconnect していても送る | 1 red |

**実機 A —— 順序**（既定 bind, port 34730）。ログ行番号で見て bind が banner より前:

```text
15:[bind] also listening on ::1:34730 so http://localhost:<port> can only mean this server
22:  ✓ MulmoTerminal is ready
23:  → http://localhost:34730
```

**実機 B —— 起動中の横取り**（port 34731、launcher の probe が終わったあと 6 秒目で `::1` を
別プロセスが取る）。この round より前なら launcher は `localhost` を開いていた:

```text
[bind] could not also listen on ::1:34731 (EADDRINUSE) — the browser opens http://localhost:<port> …
  → http://127.0.0.1:34731
[mulmoterminal] Something else is already listening on [::1]:34731, so the browser is being sent to
http://127.0.0.1:34731 … they are filed under http://localhost:34731.
```

サーバは通常どおり起動（`127.0.0.1` = 200）。2 層が同じ状況について食い違わずに話す。

ゲート再実行: `format` / `lint` / `typecheck` / `build` / `test` すべて exit 0、
`yarn test` **11593 passed / 50 skipped**。

> `test/bin/probe-bind-host.spec.ts` の source-text ガードが `beginReady(reported)` を閉じ括弧
> ごと固定していて、引数が増えて red になった。**欠陥ではなく guard の脆さ**で、そのすぐ上の
> コメントが「この guard は 2 度それで壊れた」と警告していた（今回で 3 度目）。第 1 引数だけを
> 見る形に緩め、何を守っているのかを書き足した。

## レビュー iter-2 —— 印字も「答えが出てから」

Codex（`CHANGES REQUESTED`）:

> `server/index.ts` still prints a `localhost` URL before the asynchronous `::1` bind outcome is
> known. Direct `npm run server` starts have no IPC parent to replace that announcement.

**iter-1 で IPC は直したのに、その隣の `console.log` を見落としていた。** listen callback の
先頭で `mulmoterminal running at http://localhost:${PORT}` を無条件に出していて、これは
**launcher の居ない直起動（`yarn dev` / `npm run server`）では operator が持つ唯一の情報**。
直す対象は「readiness の名乗り」ではなく「**まだ答えの出ていないことを断言する行すべて**」
だった、というのが本質。

`localBrowserUrl(port, boundAddress, outcome)` を追加し、印字も bind の後に移した。降り方は
「まだ真であること」の順:

1. `::1` を持っている → `http://localhost:<port>`
2. 持っていないが `127.0.0.1` は持っている → `http://127.0.0.1:<port>`
3. どちらも無い → カーネルが報告した bind アドレス（v6 literal は bracket する）

`localhost` を出さなかったときは理由も 1 行出す。黙って別アドレスを出すと、operator は見慣れない
アドレスを前に検索語すら持たない。

`LoopbackOutcome` に `v4LoopbackServed` を足したが、**wire には載せない**。launcher が決める
ことは 1 つ（ブラウザを `localhost` へ送ってよいか）だけで、v4 の可否はこの process だけが
使う。読まれないフィールドは、いつか間違って読まれる。

### iter-2 の検証

| ミューテーション | 結果 |
|---|---|
| 常に `localhost` を印字する（= 指摘された挙動） | 4 red |

**実機 —— 直起動**（`npx tsx server/index.ts`、launcher 無し）

| 条件 | 印字 |
|---|---|
| `::1` が空、port 34740 | `[bind] also listening on ::1:34740 …` → `mulmoterminal running at http://localhost:34740` |
| `::1` を他プロセスが保持、port 34741 | `mulmoterminal running at http://127.0.0.1:34741` + `[bind] not printing http://localhost:34741 — something else holds [::1]:34741 …`。サーバは生存（`127.0.0.1` = 200） |

ゲート: `format` / `lint` / `typecheck` / `build` / `test` すべて exit 0、
`yarn test` **11601 passed / 50 skipped**。

> spec が `sonarjs/no-clear-text-protocols` に引っかかった（LAN アドレスの literal URL）。
> `test/bin/probe-bind-host.spec.ts` が同じ問題を `new URL()` で assert して回避しているので
> それに合わせた。

## レビュー iter-3 —— 「半分の保証は、小さい保証ではなく無い」

Codex（`CHANGES REQUESTED`）:

> `localBrowserUrl` selects `localhost` when only `v6LoopbackServed` is true. If the primary owns
> `::1` but the auxiliary `127.0.0.1` bind loses to another process, IPv4-preferring clients can
> still reach that other process at `localhost:<port>`.

**対称のケースを見落としていた。** `localhost` は v4 と v6 の**どちらにも**解決し、クライアントに
よってどちらを先に試すかが違う（Chrome は `::1`、他は v4）。片方を持っているだけでは、もう片方は
誰でも取れるまま残る。**半分の保証は小さい保証ではなく、無い。**

- `localhostIsOurs(outcome) = v4 && v6` を導入し、印字も wire もこれ 1 つで決める
- `localBrowserUrl` の降り方も直した。以前は「v6 を持っていれば localhost、でなければ
  127.0.0.1」だったので、**`::1` を持ち v4 を失った状態で 127.0.0.1 を印字**していた ——
  読者を手ずから相手のプロセスへ送る、欠陥そのものの縮図。いまは「持っている方の loopback」を
  名乗る
- 理由の行は**失った側のアドレス**を名指しする（両方失えば両方）。operator が空けに行くのは
  そこなので
- wire は `v6LoopbackServed` から `localhostIsOurs` へ。**入力ではなく答えを載せる。**
  片方だけを wire に出すと、読む側がそれを全体だと扱う余地が残る（iter-2 で私がやった間違い）

### iter-3 の検証

| ミューテーション | 結果 |
|---|---|
| `localhostIsOurs` が v6 だけを見る（= 指摘された挙動） | 2 red |

**実機 —— 指摘そのもののケース**（直起動、`MULMOTERMINAL_HOST=::1`、`127.0.0.1:34750` を
別プロセスが保持）:

```text
[bind] could not also listen on 127.0.0.1:34750 (EADDRINUSE) — … hooks and the GUI MCP will fail …
mulmoterminal running at http://[::1]:34750
[bind] not printing http://localhost:34750 — something else holds 127.0.0.1:34750, …
```

`curl http://127.0.0.1:34750` は `STRANGER-v4` を返し、`[::1]` は我々が 200 を返す。
`localhost` は名乗らない。

ゲート: `format` / `lint` / `typecheck` / `build` / `test` すべて exit 0、
`yarn test` **11604 passed / 50 skipped**。

## レビュー iter-4 —— 「取られた」と「そもそも無い」は別物

Codex（`CHANGES REQUESTED`）:

> On IPv4-only hosts, `EADDRNOTAVAIL` for `::1` is treated as though another process owns it, so
> the launcher unnecessarily avoids the safe `localhost` origin and misreports a collision.

**この plan の最初の版が「IPv6 の無いマシンは `EADDRNOTAVAIL` になるが、そこでは `localhost` は
v4 のみなので実害が無い」と書いていて、コードがそれを実装していなかった。** 主張と実装のずれ。

boolean をやめ、3 状態にした:

| 状態 | 意味 | `localhost` への影響 |
|---|---|---|
| `ours` | primary が既に応答するか、補助 listener が取った | 使える |
| `absent` | このマシンにそのアドレスが無い（`EADDRNOTAVAIL` / `EAFNOSUPPORT`） | **誰も応答できないので無害** |
| `taken` | 他人が応答する | 使えない |

`localhostIsOurs = v4 !== "taken" && v6 !== "taken" && (どちらかが "ours")`。
最後の条件は「両方 absent なら `localhost` は何も指さない」ため —— 名前が何も指さない方が、
リテラルのアドレスより悪い。

`absent` には**警告を出さない**。居ない相手を告発することになるので。理由の行も `taken` の
アドレスだけを名指しする。

**`bin/cli-args.js` の `probeFailureIsPortInUse` が既に同じ規則を書いていた** ——
「`EADDRINUSE` だけがこの問いに答える」。repo は答えを知っていて、このファイルだけが
適用していなかった。#1876 のときと同じ形。

### iter-4 の検証

| ミューテーション | 結果 |
|---|---|
| どの失敗も rival として扱う（= 指摘された挙動） | 7 red |

**未検証（実機）** —— IPv4-only ホスト。macOS では `::1` を外せないので `absent` 経路は
spec のみ。分類そのもの（errno → 状態）と、そこから先の判断は spec で固定してある。

既定ホストでの回帰が無いことは実機で確認: `[bind] also listening on ::1:34760` →
`mulmoterminal running at http://localhost:34760` → launcher も `→ http://localhost:34760`。

ゲート: すべて exit 0、`yarn test` **11612 passed / 50 skipped**。

## レビュー iter-5 —— 「衝突が答えである」ケースを名前が隠していた

Codex（`CHANGES REQUESTED`、CodeRabbit も同じ箇所に inline）:

> The `::` dual-stack path still classifies the intentionally accepted `127.0.0.1` `EADDRINUSE`
> as `taken` rather than `ours`, so it unnecessarily suppresses `localhost` even though the
> primary listener owns both loopbacks.

**そのとおり。** `::` の primary が dual-stack で v4 も取っているカーネルでは、補助の
`127.0.0.1` bind は **primary 自身**と衝突する。それは「負けた」のではなく「もう持っている」
ことの証明で、`loopbackListenPlan` のコメントは最初からそう書いていた。iter-4 で 3 状態に
したとき、この分岐を通していなかった。

**原因の半分は名前だった。** フラグは `inUseIsFine` —— 「fine」は「無視してよい」と読める。
実際の意味は「**この EADDRINUSE は primary が持っている証拠**」で、無視ではなく `ours` と
数えるべきもの。`inUseProvesPrimary` に改名し、分類もそこを通す。

### iter-5 の検証

| ミューテーション | 結果 |
|---|---|
| dual-stack の衝突を `taken` として扱う（= 指摘された挙動） | 3 red |

**実機（`MULMOTERMINAL_HOST=::`, port 34765）** —— `localhost` を名乗り、3 アドレスとも 200:

```text
[bind] also listening on 127.0.0.1:34765 so this machine's own sessions can reach the server
mulmoterminal running at http://localhost:34765
  → http://localhost:34765
```

**ただしこの run は衝突経路を通っていない。** macOS の `::` は v4 を取らないので補助 bind が
**成功**する（測定済み）。衝突が起きるのは dual-stack のカーネル（Linux）だけで、そこは spec で
固定してある。**macOS で緑になることが、この修正が効いている証拠にはならない**ので明記する。

CodeRabbit の Minor（MD040、ログの code fence に言語が無い）も対応した。

ゲート: すべて exit 0、`yarn test` **11613 passed / 50 skipped**。

## レビュー iter-6 —— 推測をやめて、カーネルに直接聞く

Codex（`CHANGES REQUESTED`）:

> treats every IPv4 `EADDRINUSE` after a `::` bind as proof of dual-stack ownership. On
> `net.ipv6.bindv6only=1` hosts, it can instead be an unrelated `127.0.0.1` listener.

**iter-5 の裏返しで、これも正しい。** `inUseProvesPrimary` は「`::` なら dual-stack だろう」と
いう**推測**だった。#1834 の時点ではその推測が外れても失うのは警告 1 本だったが、いまは
`localhost` を安全と名乗るかどうかが乗っている。**同じ推測でも、賭け金が変わった。**

保守側に倒す（`::` では常に taken 扱い）案は取らなかった。Linux の dual-stack という**よくある
構成**で `localhost` origin を黙って失うことになり、それはこの一連の作業が直した不具合そのもの。

代わりに**測る**。`kernelV6WildcardTakesV4()`:

1. `[::]:0` に bind し、カーネルが選んだ ephemeral port を取る
2. その port の `127.0.0.1` に bind してみる
3. `EADDRINUSE` → このカーネルの `::` は v4 も取る / 成功 → `bindv6only`

**カーネルが今しがた配ったポートを他人が握っていることはあり得ない**ので、ここでの
`EADDRINUSE` は wildcard ソケット自身以外にならない。実 port について同じ問いを立てても
「自分か他人か」を分けられないが、この問いなら分けられる。答えはポートではなく**カーネルの
性質**なので、そのまま転用できる。

これはこのファイルの元からの流儀（"ATTEMPT the bind and read the answer"）を、推測が残っていた
最後の 1 箇所に適用しただけ。

驚いたときは `false` を返す。「dual-stack でない」に倒れると本来使えたカーネルで `localhost`
origin を失うだけだが、逆に倒れると `127.0.0.1` を握っている相手に origin を渡す。

### iter-6 の検証

| ミューテーション | 結果 |
|---|---|
| `::` を無条件に dual-stack とみなす（= 指摘された挙動） | 2 red |
| probe が「どの失敗も dual-stack」と読む | **このカーネルでは観測不能**（v4 bind が別理由で失敗しないと到達しない）。正直に記録する |

**probe をこのマシンで実行**: `:: takes v4 = false`。これは iter-1 の bind マトリクスで
`::` の補助 v4 bind が**成功**した観測と一致する —— 独立に測った 2 つが同じことを言っている。

**実機（probe 追加後の回帰確認）**

| bind | banner | localhost | 127.0.0.1 | [::1] |
|---|---|---|---|---|
| 既定 | `→ http://localhost:34770` | 200 | 200 | 200 |
| `::` | `→ http://localhost:34771` | 200 | 200 | 200 |

**未検証** —— `bindv6only=1` のカーネル。macOS では作れない。probe の分岐そのものは spec で
両方向を固定してある。

lint の `sonarjs/no-nested-functions` に触れたので、probe は callback のネストではなく
`bindOutcome` / `closeQuietly` を使った 3 手順の async として書いた。

ゲート: すべて exit 0、`yarn test` **11619 passed / 50 skipped**。
