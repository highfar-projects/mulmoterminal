# fix(dev): Vite dev proxy に `/htmlfile` を足す（#1758）

## User Prompt

> これすぐなおせる？
> https://github.com/receptron/mulmoterminal/issues/1758

## 背景

`yarn dev` のとき、`artifacts/` の外にある HTML を Files ペインから Canvas で開くと iframe が真っ白になる。
`vite.config.ts` の dev proxy に `/htmlfile` が無く、Vite の SPA catch-all が **アプリの index.html** を
返してしまう。sandboxed iframe（origin `null`）がそこから `/@vite/client` を読もうとして CORS で落ちる。

`/artifacts` は html-plugin 導入時（#57）に proxy へ入ったが、`/htmlfile` mount
（`server/backends/html.ts` `mountHtmlFileRoute`、#1065）が後から入ったときに proxy 側が更新されなかった。
本番は Vite を経由しないので **dev 限定**。

`htmlFileUrl()` は artifacts 外のファイルに `/htmlfile/…` を返すので、セルの cwd にある普通の `.html` を
Canvas で開くと必ずこの経路に乗る。

## 修正

1. `vite.config.ts` の proxy に `/artifacts` と同じ形のエントリを足す。パスは文字列リテラルではなく
   **サーバの route が使うのと同じ `HTML_FILE_MOUNT`**（`@mulmoclaude/html-plugin`）を import して使う。
   今回の失敗は「同じ文字列を 2 箇所に書いて片方だけ増えた」なので、記号を共有して次を防ぐ。
2. 回帰テスト `test/config/vite-dev-proxy.spec.ts`。prefix のリストを 2 度書くのではなく、
   **Canvas が実際に組み立てる URL**（`htmlArtifactPreviewUrl` / `htmlFileUrl`）を proxy テーブルに当てる。
   プラグインが新しい URL 形を返し始めたら、真っ白なペインではなくここが落ちる。
3. `tsconfig.test-server.json` の include に `test/config/**`。`vite.config.ts` を DOM な program
   （`tsconfig.test.json`）へ import すると `@types/node` の global が混ざり、無関係な 3 コンポーネントで
   `window.setTimeout` が `Timeout` に解決されて typecheck が落ちるため、node 側の project に置く。

## 他の mount の点検

`/api` 以外でブラウザに出る Express mount は `/artifacts/html`（proxy 済み）と `/htmlfile`（今回）の 2 つだけ。
`/ws*` は proxy 済み、それ以外の route は全て `/api/*`。抜けは無い。

## 検証

- `curl` で backend(34599) と Vite dev(6899) の応答を比較 → 中身も CSP ヘッダも一致（issue の ground truth）。
- Playwright で `sandbox="allow-scripts"` の iframe に読み込ませ、**修正前は本文が空 +
  `/@vite/client` / `/src/main.ts` の CORS エラー**（issue の再現）、**修正後は本文が描画されエラー無し**。
- SPA fallback (`/terminals`) は従来どおり index.html、`/htmlfile` の非 html は 404 のまま。
- 新 spec は修正を外すと 3 件中 2 件 fail することを確認。
- format / lint / typecheck / build / test（728 files, 10468 tests）green。

## 備考

MulmoClaude 側も `server/index.ts:507` で `HTML_FILE_MOUNT` を mount しているが、
`vite.config.ts` の proxy には無く、同じ dev 限定の穴があると思われる（本 PR では触らない）。
