# fix(cli): probe を BIND_HOST に追随させる (#1876)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 節の見出しに「（設計時）」と付いたものは、その時点のコードについての記述。
> 現在のコードの仕様はコードが唯一の情報源。

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
`yarn test` は **commit 時点で 11451 passed**（sha に紐づけた事実として記録）。

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

```
listen(34655, '10.255.255.1')  -> EADDRNOTAVAIL   （このマシンに無いアドレス）
listen(34655, 'nonsense-host') -> ENOTFOUND
listen(34655, '::')            -> OK              （この PR より前の probe）
```

`MULMOTERMINAL_HOST=10.255.255.1` での実機出力（errno ルールを入れる前）:

```
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

```
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

