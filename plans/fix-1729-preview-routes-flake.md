# fix: ルート spec が実ソケットを立てるのをやめる (#1729)

## 症状

`test/server/backends/sharedAppPreviewRoutes.spec.ts` が**フルスイートでのみ**落ちる。

| 実行の仕方 | 失敗 |
| --- | --- |
| `yarn test`（フルスイート） | **2 / 6** |
| その spec 単体を 20 回 | **0 / 20** |

負荷依存で、spec 自身の論理の問題ではない。

## 真因 — このリポジトリは既に解決済みだった

`test/helpers/appRequest.ts` のヘッダーがそのまま答えだった。

> The specs that pin a route used to hand-roll a server per file — `app.listen(0)` in a
> `beforeAll`, the port read back off `server.address()`, `fetch` against `127.0.0.1`, a
> `close()` in `afterAll`. … Under a loaded runner that is what crosses `testTimeout` first:
> in **#1314** the SAME file's six lexical tests passed while four of its five route tests failed.

**#1314 でこのクラスは解決され、`appRequest`（light-my-request の in-memory 注入）が用意されていた。**
この spec だけが、そのヘルパーが置き換えるために作られたパターンを手で書き直していた。
実ソケットを立てる spec は、リポジトリ全体でこの 1 本だけ。

## 症状は「遅い」ではなく「間違った答え」

`get()` と同じ形を vitest 抜きで 2000 回回して観測した失敗は 3 通り:

```
other side closed (UND_ERR_SOCKET)
Response does not match the HTTP/1.1 protocol (Expected HTTP/, RTSP/ or ICE/)
Unexpected token '<', "<!doctype "... is not valid JSON      ← 別のサーバーの HTML
```

**タイムアウトではなく、他所の応答を受け取っている。** 3 番目が最悪で、これは「遅い」ではなく
「テストが別のサーバーを検査してしまった」状態。

## 潰した仮説

| 仮説 | 検証 | 結果 |
| --- | --- | --- |
| `listen(0)` 直後の `address()` が null → `port = 0` | 3000 回計測 | **0 / 3000**。否定 |
| undici の keep-alive プール再利用 | `connection: close` で 2000 回 | **2 / 2000 で失敗継続**。否定 |
| `close()` を待っていない | `await close()` で 2000 回 | 0 / 2000。効く |

`await close()` でも消えるが、採らない。**ソケットを使わなければクラスごと消える**し、
それがこのリポジトリの既存の作法。

## 直し方

`get()` の `listen(0)` + `fetch` を `appRequest(server)(url)` に置き換える。ハンドラチェーンは
本物のまま（`express.json()`、ルーティング、`res.status().json()`）で、通らないのはソケットだけ。

## 検証

| | フルスイート |
| --- | --- |
| 修正前 | **2 / 6 失敗** |
| 修正後 | **0 / 10 失敗** |

従来 33% で落ちていたものが 10 回連続で緑なので、見逃し確率は 2% 程度。
spec 単体は 7 tests pass。

## 残り

`test/server/mcp/bridge.spec.ts` は別プロセスを spawn するので実リスナーが要る、と
`appRequest.ts` のヘッダーが明記している。そこは対象外。
