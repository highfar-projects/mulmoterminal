# fix(cli): probe を BIND_HOST に追随させる (#1876)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
>
> 設計時の判断・実測・レビュー対応を、起きた順に記録している。節の見出しに「（設計時）」と
> 付いたものはその時点のコードについての記述で、以後の修正で当てはまらなくなっていることが
> ある。**現在のコードの仕様はコードが唯一の情報源。**
>
> **数値は必ず sha に紐づけて書くこと。** sha の無い「N passed」は次のコミットで嘘になり、
> しかも嘘になったことが誰にも分からない（#1873 のループがこれで 2 ラウンド使い、この
> ファイルでも codex-cross-review round 2 が同じものを 1 件出した）。

## 症状

既定構成（サーバは `127.0.0.1` に bind）で MulmoTerminal が動いている状態で 2 個目を起動すると、
`Port N is already in use.` / `Start a second instance anyway? [y/N]` が **spawn の前に出ない**。
代わりに他人のサーバの 200 を根拠に偽の `✓ ready` バナーが出て、そのあと exit 1 する。

#611 / #653 で入れたポートレベルの二重起動ガードが、既定構成では一度も発火していない。

## 原因 —— 同一ファイル内での住所の食い違い

| 箇所 | 何を見るか | 結果 |
|---|---|---|
| `isPortFree` (`bin/mulmoterminal.js`) | `probe.listen(port)` = `::` | 「空いている」 |
| `probeOnce` (`bin/wait-ready.js`) | `get({ host: "127.0.0.1" })` | 「準備完了」 |

`listen(port)` は host 無しなので `::` に bind する（実測: Node の既定 listen は `{"address":"::"}`）。
サーバは `BIND_HOST = process.env.MULMOTERMINAL_HOST || "127.0.0.1"` に bind する。

## いつ壊れたか

- `6e6b1207` (#31, 2026-06-17) —— 「サーバと同じ `::` を見る」を根拠に probe を host 無しにした。**当時は正しい**
- `b696a967` (2026-07-26) —— サーバが `BIND_HOST = 127.0.0.1` 既定に。**`bin/mulmoterminal.js` は 1 行も触っていない**

前提が崩れ、probe が取り残された。コメントは以来ずっと事実と逆を主張している。

## 直し方

`probe.listen(port, BIND_HOST)`。**固定 host にはしない** —— `127.0.0.1` 固定は #31 が直した不具合
（`::` にだけいる相手を見落とす）を逆向きに再発させる。`MULMOTERMINAL_HOST` を読んで追随させる。

`choosePort` が答えるべき問いは「誰かがこのポートを使っているか」ではなく
**「子の `listen(port, BIND_HOST)` は成功するか」**。同じアドレスを試せば正確に予測できる。

検知が直れば spawn しなくなるので、**偽 ready バナーも自動的に消える**（バナーは検知失敗の結果で
あって独立したバグではない）。

## 承知のうえで残す穴

- `MULMOTERMINAL_HOST=0.0.0.0` の人 vs 既定構成の別インスタンス（`127.0.0.1`）。ワイルドカードの
  probe は見落とす。これはレジストリ（`confirmNoRunningInstance`、#1061）の担当で、そちらは動く
- probe と実 bind の間のレース。`main` のコメントが既に認めているもの。ここだけは spawn するので
  理論上まだ偽バナーが出る。`waitUntilReady` の nonce 照合は hardening として別件

## 定数の重複

`bin/` は素の JS で `server/config/env.ts` を import できないので `"127.0.0.1"` が重複する。
`PORT_IN_USE_EXIT_CODE = 75` と同じ扱いにする —— 重複を認めたうえで、launcher のソースを読んで
両者の一致をテストで固定する（前例: `test/server/infra/server-exit.spec.ts`）。

## 検証（計画）

- ユニット: host 決定の純関数、`::` / `0.0.0.0` / `127.0.0.1` の各設定で何を返すか
- 一致テスト: `bin/` の既定値と `server/config/env.ts` の `BIND_HOST` 既定値が一致すること
- **実機**: 稼働中サーバがいる状態で 2 個目を起動し、`Port N is already in use.` が出て
  **spawn せずに** exit すること、偽 ready バナーが出ないこと

## 実装（2026-08-27）

- `bin/cli-args.js` に純関数 `bindHostFor(env)` を追加。`env.MULMOTERMINAL_HOST || "127.0.0.1"`
- `bin/mulmoterminal.js` に `const BIND_HOST = bindHostFor(process.env)` を 1 つ置き、
  **2 箇所**の probe を通す:
  - `isPortFree` → `probe.listen(port, BIND_HOST)`
  - `findEphemeralPort` → `probe.listen(0, BIND_HOST)`（**同じ欠陥の 2 つ目のサイト**。
    ワイルドカード上で空いているエフェメラルポートが `BIND_HOST` では埋まっている可能性がある）
- `bin/cli-args.d.ts` に宣言を追加
- 事実と逆を主張していたコメントを、経緯（`6e6b1207` → `b696a967`）ごと書き換え

## テスト

- `test/bin/cli-args.spec.ts` — `bindHostFor` の挙動（既定・widen・空文字・非破壊）
- `test/bin/probe-bind-host.spec.ts`（新規）— **両者の一致**を固定する:
  - `bindHostFor({})` が `server/config/env.ts` の `BIND_HOST` と一致
  - `server/config/env.ts` が `MULMOTERMINAL_HOST` から導出し続けていること（正規表現）
  - launcher に host 無しの `probe.listen(...)` が残っていないこと
  - 衝突の前提（同一アドレスなら検知する）を実際に bind して確認

**ワイルドカード probe が loopback の相手を見落とすことは、あえて assert していない。** macOS では
実測でそうなる（それが #1876 の再現条件）が、これはプラットフォーム挙動で、バグが存在しない OS で
CI が赤くなると「無視される job」を作ってしまう。修正はこれに依存していない（`BIND_HOST` を
probe するのはどちらでも正しい）。

### break-verify

| ミューテーション | 結果 |
|---|---|
| `isPortFree` を host 無しに戻す | 1 red |
| `findEphemeralPort` を host 無しに戻す | 1 red |
| `bindHostFor` が env を無視して `127.0.0.1` 固定を返す | 2 red |

各回のあと、`bin/cli-args.js` と `bin/mulmoterminal.js` がバックアップと **byte-identical** で
あることを `diff -q` で確認。

## 実機検証（2026-08-27、clean env + scratch HOME、稼働中サーバが 34567 を保持）

| 条件 | 結果 |
|---|---|
| 34567 が埋まっている状態で 2 個目（`--port 34567`） | `Port 34567 is already in use.` / exit 1。**`Starting...` も偽 ready バナーも出ない**（= spawn していない） |
| 空きポート 34621 で通常起動 | `Starting...` → `running at` → 本物の ready → `GET / -> 200` |
| `MULMOTERMINAL_HOST=0.0.0.0` で 34622 起動 | 正常起動、`GET / -> 200`（probe の 0.0.0.0 が誤検知しない） |
| 同じ 0.0.0.0 設定で 2 個目 | ガード発動、`Starting...` なし |

修正前は 1 行目が `Starting MulmoTerminal on port 34567...` → 偽 `✓ ready` → exit 1 だった。

ゲート: format / lint / typecheck / build / test すべて 0。
`yarn test` は **commit `8eb93eb9` の時点で 11451 passed**（sha に紐づけたので、あとから増えても嘘にならない）。

## codex-cross-review 対応（2026-08-27、round 1）

Codex は round 1 で **LGTM**（全 10 軸 none、FINDINGS COMPLETE あり）。しかし自分の評価で
**Codex が挙げなかった MUST-FIX を 1 件**見つけたので、この round は clean にしていない。

### probe が host を名乗ったことで、新しい errno クラスが到達可能になった

`isPortFree` は **あらゆる** エラーを「使用中」に潰していた:

```js
probe.once("error", () => resolve(false));
```

host 無しの bind は事実上失敗しないので、この雑さは今まで表に出なかった。host を名乗らせた
ことで初めて到達可能になる（macOS で実測）:

```text
listen(34655, '10.255.255.1')  -> EADDRNOTAVAIL   （このマシンに無いアドレス）
listen(34655, 'nonsense-host') -> ENOTFOUND
listen(34655, '::')            -> OK              （この PR より前の probe）
```

`MULMOTERMINAL_HOST=10.255.255.1` での実機出力（errno ルールを入れる前）:

```text
Port 34656 is already in use.
  If that is MulmoTerminal, it is already running at http://localhost:34656
  Pick a different --port, or stop the other process.
```

**全文が嘘。** 34656 は誰も掴んでいないし、問題はポートではなくアドレスが存在しないこと。
しかも「動いているプロセスを止めろ」「別のポートにしろ」と、存在しない相手を追わせる。

### 直し方

「このポートは取られているか」に答えられるのは `EADDRINUSE` だけ。それ以外は
**probe が問えなかった**のであって、そのときは launch を進めてサーバに本当の errno を
報告させるのが有用（= この PR より前の挙動と同じ）。

```js
// bin/cli-args.js — socket 無しで検証できるよう純関数に
export function probeFailureIsPortInUse(err) {
  return Boolean(err) && err.code === "EADDRINUSE";
}
```

修正後の同じコマンド:

```text
[mulmoterminal] server error: listen EADDRNOTAVAIL: address not available 10.255.255.1:34656
```

### Codex の判断（step C-bis、同一 round 内）

4 点すべて同意。1 点、私の言い方より正確な指摘があったので採用した ——
**雑なルール自体は元からあり、この PR は `EADDRNOTAVAIL` / `ENOTFOUND` を「到達可能にした」**。
「この PR が作った」ではない。

`findEphemeralPort` は据え置きで合意。「このホストで空きポートを取れるか」を問うており、
BIND_HOST が bind 不能なら「空きポートが見つからない」は精度は低いがその launch にとって真。

### 前例を後から見つけた

`server/config/worktree-env.ts:63` の `isPortFree` は **既にこのルールを正しく実装していて、
コメントに理由まで書いてある**:

> Loopback and not 0.0.0.0: a dev server listening on every interface makes a loopback bind fail
> too, so this still sees it, while probing 0.0.0.0 would MISS a server bound to 127.0.0.1 only.

つまり repo は答えを知っていて、**launcher だけが仲間外れ**だった。そちらの errno 潰しは
`127.0.0.1` 固定（loopback は必ず存在する）なので EADDRNOTAVAIL / ENOTFOUND が起き得ず、
正しいまま。

### break-verify（追加分）

| ミューテーション | 結果 |
|---|---|
| `probeFailureIsPortInUse` が常に true | 7 red |
| `isPortFree` の error ハンドラを `resolve(false)` に戻す | 実機で偽の "already in use" が再現 |

各回のあと `diff -q` でバックアップと byte-identical であることを確認。

### この時点のゲート

format / lint / typecheck / build / test すべて exit 0。
`yarn test` は **commit `7f7b45f8` の時点で 11459 passed**（errno ルールのテスト 8 件が増えた分）。

> 数値と sha は**同じ行**に置くこと。前の行に sha があっても人間は読めるが、行単位の grep
> からは見えないので、claims sweep がすり抜ける。

## gh-review-loop 対応（2026-08-27）

`/codex-cross-review` は**ローカルの `codex exec`** を回すもので、**GitHub 側の bot が PR に
書いたものを一切読まない**。そのループが 3 ラウンドで LGTM に収束している間、CI の
`Codex auto-review` と CodeRabbit の指摘がスレッドに未読で残っていた（CI Codex 自身が
"this remains the unresolved … issue from the earlier Codex changes-requested" と言っている）。
**2 つのループは代替ではない。**

### iter-1 — spec 自体の欠陥 2 件（CI Codex と CodeRabbit が独立に同じ 2 件）

1. **default-host の assertion が実行環境に依存していた。** `bindHostFor({})`（常に fallback）と
   `BIND_HOST`（実値）を比較していたので、`MULMOTERMINAL_HOST` を export している runner では
   欠陥が無くても赤くなる。修正前に再現: `MULMOTERMINAL_HOST=0.0.0.0` で
   `expected '127.0.0.1' to be '0.0.0.0'`。絡まっていた 3 つの主張に分解した ——
   ①どんな環境でも launcher と server は同じアドレスを選ぶ ②**default** は server の
   **ソース**に対して固定（実環境が届かない） ③widen した場合。
2. **`peer.release()` が非同期 close を投げて即 return し、固定 50ms sleep が代役をしていた。**
   遅い runner では次の bind が close と競合し、自分のテストの peer を「衝突」と報告し得る。
   close コールバックで resolve する promise を返し、両呼び出し側で await。

CodeRabbit の 3 件目（plan 内のチェックマーク）は **却下**。2 箇所とも backtick 内で
`printReadyBanner` が実際に出力する文字列の逐語引用で、CLAUDE.md が `bin/mulmoterminal.js` の
`✓ / ✗ / ○` を意図的な機能的例外として明記している。消すと引用が嘘になる。理由は inline
スレッドに返信済み。

### iter-2 — 「子プロセスの bind は 1 つではない」（CI Codex、質の高い指摘）

`MULMOTERMINAL_HOST` が非 loopback の具体アドレスのとき、`server/index.ts` は primary の bind
の**後に** `startLoopbackListener` で `127.0.0.1:<port>` も bind する。probe はその 1 つ目しか
見ていなかった。**実測で完全に再現**:

```text
（stranger が 127.0.0.1:34660 を保持している状態で）
listen(34660, "192.168.11.12") -> free        <- 修正済み probe が問うもの
listen(34660, "127.0.0.1")     -> EADDRINUSE  <- 子が「も」必要とするもの

MULMOTERMINAL_HOST=192.168.11.12 mulmoterminal --port 34660
  ✓ MulmoTerminal is ready
  → http://localhost:34660
$ curl http://localhost:34660/   ->  NOT MULMOTERMINAL
```

**bot の提案する修正には従っていない。** 「両方の listener を reserve/check せよ」だが、それは
launch を止めることになり、server 側の**意図的な判断**を上書きする ——
`startLoopbackListener` のコメントが明記している:

> BEST EFFORT, and deliberately not fatal: … Failing the boot because the extra one could not
> bind would turn a degraded setup into no setup at all — so it warns … and carries on.

degrade して警告する、は server が選んだ挙動。**本当の欠陥はバナーが嘘をつくこと**で、そちらは
どこにも意図されていない。原因は #1876 とまったく同じ形 —— **launcher の 3 つ目の
「このポートはどのアドレスのことか」問い合わせ箇所が、`127.0.0.1` をハードコードしていた**
（`bin/wait-ready.js` の `probeOnce`）。probe を 2 箇所直して 3 箇所目を残すのは
「site を直して class を直さない」そのもの。

- `launcherReachHost(bindHost)` —— 起動した server に**到達する**アドレス。
  `0.0.0.0`→`127.0.0.1`、`::`→**`::1`**（127.0.0.1 の v4 socket は dual-stack より
  **specific** なので接続を奪う。それが今回の事象そのもの）、具体アドレス→自分自身
- `launcherUrl(bindHost, port)` —— 表示用。loopback を serve するなら `localhost`、
  でなければ実アドレス
- `probeOnce` / `waitUntilReady` が host を受け取るようにし、launcher が渡す

修正後、同じシナリオ:

```text
  ✓ MulmoTerminal is ready
  → http://192.168.11.12:34661        <- 200、我々の server
（localhost:34661 は stranger のまま。server 自身の [bind] 警告がその degrade を説明する）
```

### 途中で潰した自分のミス 2 件

- **`new URL` の `hostname` setter は括弧なしの IPv6 を黙って無視する。** 実測すると
  `fd00::1` を入れても `localhost` のまま。信じて出荷していたら、v6 bind で
  launcher が `localhost` を表示して**赤の他人に案内する**という、この PR が扱っている
  クラスそのもののバグになっていた。代入前に括弧を付ける
- **最初に書いた source-guard は書式に依存していた。** `waitUntilReady(port,` を探していたが、
  prettier が呼び出しを複数行に折り返した瞬間に赤くなった。**formatter が壊せる guard は
  直されずに消される**ので、レイアウトではなく式（`host: launcherReachHost(BIND_HOST)`）で照合する

### break-verify（iter-1 / iter-2 追加分）

| ミューテーション | 結果 |
|---|---|
| `bindHostFor` を定数に固定 | env 未設定で 1 red、`=0.0.0.0` で 2 red |
| `release` を no-op に | 1 red |
| readiness poll を loopback ハードコードに戻す | 1 red |
| `::` を `127.0.0.1` にマップ（shadowing バグ） | 1 red |

各回のあと `diff -q` で byte-identical 復元を確認。

ゲート: format / lint / typecheck / build / test すべて exit 0。
`yarn test` は **親 `c8901e90` + この節の変更を入れたツリーで 11470 passed**（前方参照にしないため、既知の sha で書いた）。

### iter-3 — CodeRabbit が現 head を初めて読み、Major を 1 件

CI Codex は `c109f61b` に **LGTM** を出した。同じ head を CodeRabbit が読んで、**正確な Major**:

> `launcherReachHost` selects `::1` to prevent an IPv4 loopback listener from answering the
> readiness check. Line 119 then converts `::1` back to `localhost`. A browser can resolve
> `localhost` to the competing IPv4 listener, so the printed and auto-opened URL can again
> target another process.

そのとおりだった。**poll を精密にしておきながら、URL でその精度を捨てていた。** 実測:

```text
localhost resolves to: [{"address":"::1","family":6},{"address":"127.0.0.1","family":4}]
```

`localhost` は両方に解決するので、ブラウザは poll が避けたはずのプロセスを開き得る。
**ユーザーがクリックする URL は、チェックしたアドレスを名乗らなければならない。**

`launcherUrl` は `localhost` を返すのをやめ、常に具体アドレスを名乗る:

| bind | 表示 |
|---|---|
| `127.0.0.1` / `0.0.0.0` | `http://127.0.0.1:<port>` |
| `::` | `http://[::1]:<port>` |
| 具体アドレス | そのアドレス |

既定構成のユーザーにも見える変更（`localhost` → `127.0.0.1`）だが、この PR の主題は
**launcher が嘘をつかないこと**なので、親しみやすさより真実を取る。実機で確認:
バナーが `http://127.0.0.1:34670` を出し、その URL が 200 を返す。

MD040（fence に言語指定が無い）も指摘された。CodeRabbit が挙げたのは diff hunk 内の 2 箇所
だったが、**ファイル全体を走査して 5 箇所すべて**にラベルを付けた（closer は対象外）。

break-verify: URL を `localhost` に戻すと 3 red。復元は byte-identical。

### iter-4 — P1、そして **3 件目なのでルールを反転させた**

CI Codex の P1:

> `localhost` is neither normalized nor resolved here, so it reintroduces the false-ready path
> this change is trying to eliminate. … Map this supported hostname to the concrete address
> actually selected by the child (or communicate that bound address back from the child)

実測で裏付け:

```text
server.listen(port,"localhost") -> {"address":"::1","family":"IPv6"}   （このマシンでは）
launcherReachHost("localhost")  -> "localhost"                          （未処理・曖昧なまま）
```

**これは `launcherReachHost` への 3 件目の指摘**（iter-2: poll のハードコード、iter-3: URL が
`localhost` に戻す、iter-4: `localhost` という綴り）。ケースを足し続けるのをやめる ——
ホスト文字列の綴りに最後のケースは無い（`localhost` / `127.1` / `127.000.000.001` /
hosts ファイルで別所を指す `localhost` …）。

**反転**: 要求された文字列を分類するのをやめ、**子プロセスに実際に bind したアドレスを
報告させる**。`server/index.ts` には既に `{ type: "listening", port }` の IPC 通知があり、
コメントに「launcher が IPC を開かないので no-op」と書いてあった —— 半分できていた。

そして `server/infra/loopback.ts` が、まさにこの反転の根拠を既に書いていた:

> Classifying the requested string cannot be made right: `localhost`, `127.1`, `127.0.1` and
> `127.000.000.001` are all valid ways to ask for loopback, and `localhost` can be pointed
> somewhere else entirely by a hosts file. **Asking after the fact answers all of them, because
> the kernel has already resolved whatever was typed.**

（errno のときの `worktree-env.ts` と同じで、repo は既に答えを知っていた。）

- `server/infra/loopback.ts` に `boundAddress()` を追加（`isLoopbackBinding` の隣）
- `server/index.ts` は IPC 通知に **address を載せる**（dev supervisor は `type` しか見ないので追加は安全）
- launcher は spawn の stdio に `"ipc"` を足し、`{type:"listening", address}` で readiness を開始
- `BIND_HOST` からの推測は **20 秒のフォールバック**としてのみ残す（何も報告しないサーバでも
  バナーが出るように）

P1 のシナリオを実機で確認（stranger が 127.0.0.1:34695 を保持、`MULMOTERMINAL_HOST=localhost`）:

```text
  ✓ MulmoTerminal is ready
  → http://[::1]:34695        -> HTTP 200（我々のサーバ）
```

回帰確認: 既定構成は `http://127.0.0.1:34696` で 200、埋まったポートのガードも従来どおり発動。

break-verify: `"ipc"` を stdio から外すと 1 red、`beginReady(msg.address)` を
`beginReady(BIND_HOST)` に戻すと 1 red。復元は byte-identical。

### iter-5 — 反転を最後までやる（**4 件目**）と、チェックポイント

CI Codex の P1、iter-4 の修正そのものに対して:

> The 20-second fallback still reinstates the `localhost` false-ready race this IPC path fixes.

**正しい。** ルールを反転させておきながら、**古い列挙をフォールバックとして残した**ので、
そこから同じ穴が開いていた。起動が 20 秒を超えると `beginReady(BIND_HOST)` が走り、
`launcherReachHost("localhost")` は未解決のまま返していた。

これが同じルールへの **4 件目**。反転を最後までやる ——
**名指しできるものだけを許可し、それ以外は null を返して「分からない」と報告する**:

```js
export function launcherReachHost(bindHost) {
  if (bindHost === "0.0.0.0") return "127.0.0.1";
  if (bindHost === "::") return "::1";
  return isIP(bindHost) ? bindHost : null;   // 名前は kernel に訊く。ここでは推測しない
}
```

`net.isIP` を使うのは、これが**列挙ではない**から。`localhost` / `foo.local` / `127.1` /
`127.000.000.001` / `""` はすべて null になる —— 綴りを 1 つずつ潰すのではなく、
プラットフォーム自身が IP と呼ぶものだけを通す。**fail closed**: 誰も想像しなかった
将来の綴りは「バナーが出ずに理由が 1 行出る」であって、「見知らぬプロセスを自信満々に
poll する」ではない。

フォールバックは `launcherReachHost(BIND_HOST)` が非 null のときだけ走る。名前のときは
走らず、代わりにこう出る:

```text
Started, but localhost is a name and the server has not reported which address it bound
— not guessing. It may still be starting.
```

実機確認（stranger が 127.0.0.1:34700 を保持、`MULMOTERMINAL_HOST=localhost`）:
バナー `http://[::1]:34700` → 200。既定構成は `http://127.0.0.1:34701` → 200。

### iteration 5 のチェックポイント（PR 全体の読み直し）

- **PR は当初の主張どおりか** —— 部分的に否。当初は「probe の host」だけだったが、いまは
  launcher の「このポートはどのアドレスか」を問う**全 3 箇所**（probe / readiness / URL）に
  及ぶ。**PR 本文が実態から乖離していたので更新した。**
- **重心は動いたか** —— 動いた。元の修正 282 行に対しレビュー由来 603 行。ただし 283 行は
  この plan（ループの記録）、186 行はテストで、プロダクションコードは 166 行
- **分割すべきか** —— しない。3 箇所は**1 つの不変条件**の 3 つの現れで、どれか 1 つだけ
  revert すると「ガードは効くがバナーは嘘をつく」かその逆になる。まとめて正しいか
  まとめて間違っているかのどちらか
- **最大の残存リスク** —— IPC チャネルは**全 npx ユーザーが通る起動経路**に足した新しい配線。
  実機で確認済み: launcher に SIGTERM → launcher・子とも終了、ポート解放（`000`）
- **レビュー由来のコードで自分が作ったミス 3 件**（すべてこのループ中に自分で潰した）:
  `URL.hostname` が括弧なし IPv6 を黙って無視する / source-guard を書式依存で書いて
  prettier に壊された / それを直した guard をさらにリファクタで壊した。
  **guard は単一トークンの式で照合する** —— 複数行の形は 2 回壊れた

break-verify（iter-5 追加分。各回 `diff -q` で byte-identical 復元を確認）:

| ミューテーション | 結果 |
|---|---|
| フォールバックが生の `BIND_HOST` を推測する | 2 red |
| reach host が任意の文字列を通す（反転前のルール） | 7 red |
| `::` を v4 loopback にマップ | 3 red |
| 報告された文字列を解決せずに信じる | 1 red |
| 解決した値でなく生の文字列から readiness を開始 | 1 red |

### iter-6 — ワイルドカードそのものが最後の推測だった（**5 件目**）

CI Codex の P1:

> Mapping a wildcard bind to loopback is still not a reliable way to identify the child. …
> a pre-existing `127.0.0.1:<port>` process can answer the readiness poll/browser URL while
> the child is only serving through its wildcard socket.

**正しい。** ワイルドカードと具体アドレスは**共存できる**ので、ワイルドカードで bind できても
そのポートが自分のものだとは言えない。実測（stranger が 127.0.0.1:34720 を保持）:

```text
listen(34720, "0.0.0.0")   -> free         子はワイルドカードに bind できる
listen(34720, "127.0.0.1") -> EADDRINUSE   だが loopback は stranger
→ バナー: http://127.0.0.1:34720  ->  NOT MULMOTERMINAL
```

**証拠を取り違えかけた。** 最初 `http://0.0.0.0:34720` をバナーと読んだが、それは security
警告文の中の URL を grep が拾ったもの。ログを直接読むと本当のバナーは
`→ http://127.0.0.1:34720` だった。**期待した単語を grep せず、行を読むこと。**

#### 直し方 —— probe を「この launch が必要とする全アドレス」に

```js
export function probeHostsFor(bindHost) {
  if (bindHost === "0.0.0.0") return ["0.0.0.0", "127.0.0.1"];
  if (bindHost === "::") return ["::", "::1"];
  return [bindHost];               // 具体アドレスは他が持てないので 1 つで足りる
}
```

**これは iter-2 で却下した「両方 reserve せよ」と同じ判断ではない。** 違いは
*誰の決定を上書きするか*:

- iter-2 は**具体アドレス**の bind で、`loopbackListenPlan` が**意図的に degrade する**
  （best effort、warn して継続）。launcher が止めるのはその決定の上書きになる
- ここは**ワイルドカード**で、plan は `null` を返す —— サーバは「ワイルドカードが loopback も
  カバーする」と**仮定して**second listener を足さない。**意図的な degrade は無く、
  偽になり得る仮定があるだけ**。上書きするものが無い

`findEphemeralPort` も同じ理由で `isPortFree` に通すようにした（OS が「空き」と言うのは
1 アドレスについてだけなので、2 個目のインスタンスに loopback が塞がった番号を渡し得た）。

実機確認:

| 条件 | 結果 |
|---|---|
| `MULMOTERMINAL_HOST=0.0.0.0`、127.0.0.1 を占有 | `Port 34730 is already in use.` —— **ガードが発動、偽 ready 無し** |
| `MULMOTERMINAL_HOST=::`、127.0.0.1 を占有（v4 のみ） | 起動、バナー `http://[::1]:34731` → 200。**この行の「v4 の stranger は v6 の launch を妨げない」という判断は iter-7 で覆った** —— 下の節を参照 |
| 既定構成 | `http://127.0.0.1:34740` → 200 |
| 埋まったポート | ガード発動 |

break-verify: ワイルドカードが自分だけを probe → 2 red、`isPortFree` が BIND_HOST しか
見ない → 1 red。復元は byte-identical。

### iter-7 — 自分が「正しい」と記録した挙動が間違いだった（**6 件目**）

CI Codex の P1:

> The IPv6-wildcard case still leaves the server's required IPv4 loopback endpoint unchecked.
> … `startLoopbackListener` tries its necessary `127.0.0.1` listener, gets `EADDRINUSE`, and
> **deliberately suppresses that error for a `::` primary**. Local hooks and GUI MCP clients
> dial `127.0.0.1`, so they reach the other process rather than this server.

前提を 3 点とも確認した（推測ではなく grep で）:

1. `server/infra/gui-mcp-registration.ts:23` —— `guiMcpUrlTemplate` は
   `http://127.0.0.1:${MULMOTERMINAL_PORT}/api/mcp/...` を**リテラルで**組み立てる
2. `loopback-listener.ts:80` —— `inUseIsFine: bound.address === V6_WILDCARD`、つまり
   `::` のときだけ EADDRINUSE を「問題なし」とする
3. `loopback-listener.ts:106` —— `if (plan.inUseIsFine && err.code === "EADDRINUSE") return;`
   **警告すら出ない**

`inUseIsFine` の根拠は「自分の dual-stack socket が既に v4 を覆っている」だが、
**EADDRINUSE からは「自分の socket」と「見知らぬプロセス」が区別できない**。だから
`::` + v4 stranger は、GUI MCP が黙って他人と喋る状態になる。

**これは iter-6 で私が「v4 の stranger は v6 の launch を妨げない —— 正しい挙動」と
記録したケースそのもの。間違っていた。** アプリ自身が v4 loopback を要求している以上、
妨げるべきだった。上の iter-6 の表にも訂正を入れた。

`probeHostsFor("::")` は `["::", "::1", "127.0.0.1"]` になった。127.0.0.1 は
**shadowing の話ではなくアプリの要件**なので、`gui-mcp-registration.ts` を読む
contract test で固定した（`PORT_IN_USE_EXIT_CODE` と同じやり方）。

**具体アドレスの bind は今も対象外**で、根拠は iter-2 で述べたものと同じ:
そちらは `inUseIsFine` が false で**サーバが警告する**ので、degrade するという判断が
成立している。`::` は黙るから launcher が言うしかない。

> **この「サーバが警告するかどうか」という線引きは iter-8 で置き換わった。** `::1` は警告する
> が loopback 専用なので、警告付きで degrade しても「ローカルから正しく届かないサーバ」が
> 残るだけだった。現在の線引きは下の iter-8 の節にある。

実機確認:

| 条件 | 結果 |
|---|---|
| `MULMOTERMINAL_HOST=::`、127.0.0.1 を v4 stranger が占有 | `Port 34750 is already in use.` —— **iter-6 とは逆に、正しく止まる** |
| 同、stranger なし | 起動、バナー `http://[::1]:34751` → 200、**GUI MCP が dial する 127.0.0.1 も 200**（過剰検知ではない） |

break-verify: `::` から v4 loopback を落とすと 1 red。復元は byte-identical。

### iter-8 — 線引きそのものが間違っていた（**7 件目**）

CI Codex の P1: `MULMOTERMINAL_HOST=::1`（および `localhost` が `::1` に解決する場合）が
`127.0.0.1` を予約しない。子は `::1` に bind し、`startLoopbackListener` は
`inUseIsFine: false` なので**警告する**が、GUI MCP は 127.0.0.1 を dial するので他人に届く。

**これは iter-2 と iter-7 で自分が立てた原則（サーバが警告するなら launcher は止めない）に
反する。** 原則の方を見直した。

#### 「警告するか」ではなく「その bind の目的が生き残るか」

| bind | 目的 | ローカルが誤配線されたら | 判断 |
|---|---|---|---|
| ワイルドカード（`0.0.0.0` / `::`） | このマシンを含む全部 | 目的が壊れる | **止める** |
| loopback（`::1`, `127.0.0.x`, `::ffff:127.0.0.1` …） | このマシンだけ | 目的が丸ごと壊れる | **止める** |
| 具体的な非 loopback（`192.168.11.12`） | **他のマシン**に配る | その目的は無傷。ローカルの利便性だけが degrade し、サーバが警告する | **止めない**（round-2 の判断は生きている） |

`::1` は iter-7 の線引きでは間違った側に落ちていた —— 警告はするが loopback 専用なので、
警告付きの degrade は「ローカルから正しく届かないサーバ」を残すだけ。

#### アドレスの列挙ではなく**性質**で書いた

線引きが 2 回動いたので、3 回目を避けるために `isLoopbackBindHost` を
`server/infra/loopback.ts` の `isLoopbackAddress` と同じ形で書いた ——
127.0.0.0/8 全体、`::1` の両綴り、`::ffff:` マップ形式。誰も列挙しなかった綴り
（`127.0.0.2` / `::ffff:127.0.0.1` / `0:0:0:0:0:0:0:1`）が**次のラウンドではなく
性質でカバーされる**。bin/ は素の JS なので複製になるが、両者の一致は contract test で固定した。

実機確認:

| 条件 | 結果 |
|---|---|
| `MULMOTERMINAL_HOST=::1`、127.0.0.1 を v4 stranger が占有 | `Port 34760 is already in use.` —— 正しく止まる |
| 同、stranger なし | 起動、`http://[::1]:34761` → 200、GUI MCP の 127.0.0.1 も 200（過剰検知なし） |
| `MULMOTERMINAL_HOST=192.168.11.12`、127.0.0.1 占有 | **起動する** —— round-2 の判断が生きている |

break-verify: loopback bind が companion を失う → 4 red、`::1` の長い綴りを落とす → 1 red、
全リテラルを loopback 扱い（過剰検知）→ 4 red。復元は byte-identical。

### iter-9 — 綴りの分類そのものをやめた（**8 件目**、そしてクラスの終わり）

CI Codex の P1: `probeHostsFor` はワイルドカードを `::` というリテラルでしか認識しないので、
`MULMOTERMINAL_HOST=0:0:0:0:0:0:0:0`（同じアドレスの別綴り）が companion probe を素通りする。

正しい。iter-8 で loopback 側は**性質**で書いたが、**ワイルドカード側はリテラル比較のまま
残していた**。同じクラスが半分だけ生き残っていた。

#### 綴りを足すのではなく、カーネルに正規化させる

probe は**実際に bind する**。ならば `server.address()` を読めばよい。実測:

```text
listen(0, "0:0:0:0:0:0:0:0") -> {"address":"::"}
listen(0, "::0")             -> {"address":"::"}
listen(0, "localhost")       -> {"address":"::1"}
listen(0, "0:0:0:0:0:0:0:1") -> {"address":"::1"}
listen(0, "127.1")           -> {"address":"127.0.0.1"}
```

**カーネルの入力語彙は無限だが、出力語彙は有限で固定。** だから正規化後のリテラル比較は
列挙ではない。`probeHostsFor(bindHost)` を `companionHostsFor(boundAddress)` に置き換えた:

- `canBind` は `{ free, address }` を返す（`address` は OS が言う実際の bind 先）
- `isPortFree` はまず BIND_HOST を probe し、**カーネルが答えたアドレスから** companion を決める
- そのアドレスは `choosePort` 経由で launcher まで運ばれ、readiness の fallback にも使われる
  （`BIND_HOST` を解釈するより正確）

これは `server/infra/loopback.ts` が最初から書いていた主張そのもの ——
「要求された文字列の分類は正しくできない。後から訊けば、カーネルが既に解決している」。
**8 ラウンドかけて、repo が最初から知っていた場所に辿り着いた。**

実機確認（stranger が 127.0.0.1:34770 を保持）—— **どの綴りでも同じ挙動**:

| `MULMOTERMINAL_HOST` | 結果 |
|---|---|
| `0:0:0:0:0:0:0:0` | `Port 34770 is already in use.` |
| `localhost` | 同上 |
| `127.1` | 同上 |

過剰検知なし（stranger 無しなら `0:0:0:0:0:0:0:0` → `http://[::1]` 200、`localhost` → 同、
既定 → `http://127.0.0.1` 200）。LAN bind（`192.168.11.12`）は 127.0.0.1 が塞がっていても
**起動する** —— round-2 の判断は生きている。

break-verify: companion を typed string から決める → 1 red、v6 ワイルドカードが `::1` を失う
→ 1 red、fallback が probe の答えを無視する → 1 red。復元は byte-identical。

