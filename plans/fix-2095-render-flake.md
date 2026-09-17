# fix-2095: Windows CI で shapescriptRenderTool のピクセル系が flake する

#2095 の**当座の緩和**。根本原因はプラグイン側（`receptron/mulmoclaude`）にあり、そちらは別 PR。

## 何が起きているか（実測）

`test/server/infra/shapescriptRenderTool.spec.ts` のラスタライズする3ケースが、Windows で
断続的に落ちる:

    TimeoutError: Navigation timeout of 30000 ms exceeded
     ❯ CdpPage.goto node_modules/puppeteer-core/src/api/Page.ts:1886:35
     ❯ A node_modules/@mulmoclaude/shapescript-plugin/dist/render.js:176:71

- Windows (daily): 直近12 run のうち5回失敗
- Windows (PR): **必須チェックでも発生**（run 35159396181）—— レンダリングと無関係な PR を止め得る
- 落ちる件数は run ごとに違う（PR の run は1件、daily は3件）ので、run 単位ではなく**レンダ単位**

## 原因はこのリポジトリの外

`@mulmoclaude/shapescript-plugin` の `src/render/renderer.ts` は、**ナビゲーションだけ**明示的な
予算を持たない:

```ts
timeout: LAUNCH_TIMEOUT_MS,                                        // 起動 30s
await page.goto(PAGE_URL, { waitUntil: "load" });                  // 指定なし → puppeteer 既定の 30s
await page.waitForFunction("…", { timeout: RENDER_TIMEOUT_MS });   // ラスタライズ 60s
```

`LAUNCH_TIMEOUT_MS` のコメント自身が「puppeteer の 30 秒既定を黙って継承しないため」と書いている。
`goto` がその例外として残っていた。ホスト側から渡す口は `RenderShapeScriptOptions` に無い。

手元の開発機では1レンダ約1.2秒。プラグインは呼び出しごとに Chromium を起動し直すので、負荷のかかった
Windows ランナーではそのナビゲーションが 30 秒に収まらないことがある。

## なぜ Windows だけか

ピクセル系は `it.runIf(canRender)` で、ブラウザがある環境でしか走らない。`windows-pr.yaml` と
`windows-daily.yaml` は `~/.cache/puppeteer` をキャッシュしているので Chromium が存在し、
`ci.yml`（ubuntu / macOS）はしないのでスキップされる。つまり**開発機以外で走るのは Windows CI だけ**
—— spec 自身のコメントが想定していた「開発機で走る」から外れている。

## この PR がすること

**レンダ呼び出しだけを、ナビゲーションタイムアウトに限って再試行する**（`RENDER_ATTEMPTS = 3`）。
新しい試行は新しい Chromium なので、断続的なナビゲーションタイムアウトはこれで越えられる。

**retry をケースではなく呼び出しに付けるのが要点。** 最初の形は Vitest の `retry` を使っていたが、
あれは**あらゆる失敗**を再試行する —— アサーション失敗も、保存先が違う欠陥も。実測で、1回目だけ
「saved render to the wrong directory」で落ちる欠陥がそのまま通った（Codex round 1 の P2）。
`retryingNavigationTimeouts()` に閉じ込めたので、アサーションの失敗はアサーションの失敗のまま残り、
**このファイルが存在する理由になっている flake だけ**が2度目をもらう。

**probe も同じクラス。** `it.runIf(canRender)` を決める module scope の probe が同じタイムアウトで
落ちると、3ケースは**黙ってスキップ**され、CI は緑のまま検証ゼロになる。probe も同じ関数を通す。

マッチャは `Navigation timeout of \d+ ms exceeded`。今日 puppeteer が出す 30000 を書くと、上流の
修正（60000 になる）と入れ替わる最中——まさに flake を吸収したい期間——にマッチしなくなる。

1ケースの予算は `RENDER_ATTEMPTS × RENDER_TIMEOUT_MS`。Vitest の `retry` は試行ごとに予算をくれるが、
呼び出し側で回すと全試行が1つの予算を共有するため。

### Vitest 5 の書き方に注意

オプションは**第2引数**。`it(name, fn, { ... })` は Vitest 4 で削除されていて、走らせると
`TypeError: Signature "test(name, fn, { ... })" was deprecated in Vitest 3 and removed in Vitest 4`
になる。一方**数値**を第3引数に置く形は今も有効（20秒の処理が 60 秒予算で通ることを実測）。
つまり既存の `RENDER_TIMEOUT_MS` 渡しは効いていた。`{ timeout: CASE_TIMEOUT_MS }` へ移すときに
落とさないよう注意する。

## やらないこと

- **CI でピクセル系をスキップする**。flake は消えるが、CI での検証も消える。
- **プラグインのタイムアウトをここで回避する**（例: 自前で goto する）。ホストがレンダラの
  内部を再実装する話になる。

## 検証

- 3ケースがこの機械で**走って**通ること（黙ってスキップされていないこと）。
- retry 規則そのものを、ブラウザ無しで3ケース pin する —— ナビゲーションタイムアウトは再試行される、
  それ以外は再試行されない、試行回数の上限で諦める。**ブラウザの無いホストでは他が全部スキップ
  されるので、レビュー対象の挙動が検証できるのはこの3つだけ**（Codex のサンドボックスは
  `4 passed | 3 skipped` だった）。
- 破壊検証: マッチャを何でも通す / 上限を広げる / 再試行しない、の3つがそれぞれ対応するテストを
  赤にする。
- Codex の P2 のシナリオ（1回目だけ navigation 以外の理由で失敗）を実ケースに注入し、修正前は通り、
  修正後は落ちることを確認する。
- 注入のたびに、実行後ファイルが pristine と同一であることを確認する。
