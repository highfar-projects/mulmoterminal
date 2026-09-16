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

3ケースに **retry** を付ける（`RENDER_ATTEMPTS = 3`）。新しいレンダは新しい Chromium なので、
断続的なナビゲーションタイムアウトはこれで越えられる。

**flake を吸収するが、退行は隠さない。** 恒常的に遅くなれば全試行が落ちてケースは赤になる
（実測で確認済み）。プラグインが goto にタイムアウトを設定し、その bump がここに入ったら外す。

### Vitest 5 の書き方に注意

オプションは**第2引数**。`it(name, fn, { ... })` は Vitest 4 で削除されていて、走らせると
`TypeError: Signature "test(name, fn, { ... })" was deprecated in Vitest 3 and removed in Vitest 4`
になる。一方**数値**を第3引数に置く形は今も有効（20秒の処理が 60 秒予算で通ることを実測）。
つまり既存の `RENDER_TIMEOUT_MS` 渡しは効いていた。単純に置き換えられない組み合わせなので、
オプションオブジェクトへ移すときに timeout も一緒に移す。

## やらないこと

- **CI でピクセル系をスキップする**。flake は消えるが、CI での検証も消える。
- **プラグインのタイムアウトをここで回避する**（例: 自前で goto する）。ホストがレンダラの
  内部を再実装する話になる。

## 検証

- 3ケースがこの機械で**走って**通ること（黙ってスキップされていないこと）。
- 1回目だけ失敗を注入 → ケースは通る（retry が効いている）。
- 毎回失敗を注入 → ケースは赤になる（隠蔽していない）。
- どちらの注入も、実行後にファイルが pristine と同一であることを確認する。
