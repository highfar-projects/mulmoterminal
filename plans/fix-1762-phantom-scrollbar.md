# fix #1762 — ズーム表示のエージェントセルに、実体のないスクロールバーが残る

## 症状（報告 #1762）

ズーム表示（単一セッション表示）にすると、Claude セルの右端にスクロールバーが出る。

1. つまみの高さがチャットの量とまったく連動せず、常に同じ大きさ
2. ホイールを回すと、つまみがスクロール位置と無関係に飛ぶ
3. つまみをドラッグしてもチャットは動かない（つまみだけが動く）

報告者は Windows 11 / Chrome / tmux なし。「毎回必ず発生」。

## 原因（確定済み）

alternate screen にはスクロールバックが無いので、本来この位置にスクロールバーは出ない。
出ているのは、**xterm の viewport がスクロール範囲を古い値と新しい値の混在で作ってしまう**ため。

xterm は画面外に出たセルの描画を止める（`RenderService` の IntersectionObserver → `_isPaused`）。
停止中に `terminal.resize()` が来ると:

- `BufferService.resize()` は即座に走り、`buffer.lines.length` が新しい行数になる
- `RenderService.handleResize()` は `_isPaused` を見て**レンダラのリサイズを `_pausedResizeTask` に先送り**する
  ので、`renderService.dimensions.css.canvas.height` は古い高さのまま

`Viewport._sync()` はこの2つから寸法を作る:

```
setScrollDimensions({
  height:      dimensions.css.canvas.height,                    // 古い（ズーム前）
  scrollHeight: dimensions.css.cell.height * buffer.lines.length // 新しい（ズーム後）
})
```

結果、存在しないスクロール範囲ができる。そして `_sync` を呼ぶきっかけは
`onResize` / `onBufferActivate` / `onScroll` の3つしかなく、alternate buffer では
全画面 TUI がその場で描き直すだけなので `onScroll` は二度と起きない。
**一度ずれると、次にリサイズが起きるまで直らない。**

後から IntersectionObserver が「見えた」を配ると `_pausedResizeTask` が flush されて
レンダラの寸法だけは正しくなるが、viewport を再計算するものは何も無い。

### 3症状がすべてこれで説明できる

1. つまみの比率 = 古い高さ ÷ 新しい高さ。ズーム倍率だけで決まるので、内容と無関係に一定
2. ホイールは `guardMouseWheel` が正しくエージェントへ転送している。それとは別に
   vscode 由来の `ScrollableElement` が**同じ wheel イベント**を拾い、実体のない範囲でつまみを動かす
   （`term.parser` で mouse tracking の DECSET を握りつぶしているため、xterm の
   `coreMouseService` は「アプリが wheel を欲しがっている」ことを知らず、`handleMouseWheel` を切らない）
3. ドラッグは実体のない範囲の `scrollTop` を変えるだけ。`_handleScroll` → `scrollLines` は
   alternate buffer では `ydisp === 0` で即 return するので、何も起きない

### 再現と裏取り

`@xterm/xterm@6.0.0` を本アプリと同じオプションで開き、alternate buffer に入れ、
「一度 DOM から外して IntersectionObserver に非表示を配らせてから」大きなコンテナに戻して
fit する、という手順で再現（Playwright / Chromium / macOS）。報告者の実測値と一致した:

| | 報告者 | 再現 |
|---|---|---|
| `barClass` | `invisible scrollbar vertical fade` | `invisible scrollbar vertical fade` |
| `barHeight` | 544 | 544 |
| `sliderHeight` | 341px | 342px |
| `screenHeight` | 867 | 864 |

`fade` が付くのは `_isNeeded === true`、すなわち xterm 自身が
「スクロールバーが必要」と判断しているとき**だけ**なので、これが決め手になった。
症状2・3も同じ再現環境で確認済み（ホイール: エージェントに1バイト送られる一方でつまみが独立に動く。
ドラッグ: エージェントへ0バイト、`viewportY` は 0 のまま）。

DOM から外れている時間を 0ms にすると発生しない（IntersectionObserver が非表示を配れないため）。
**Windows 固有ではなく、タイミングの問題。**

## 本リポジトリ側の引き金

このリポジトリの fit は複数の経路から走る:

- `Terminal.vue` の `ResizeObserver` → `conn.fit`
- `expanded` の watcher → `nextTick(() => conn.fit)` と `setTimeout(..., FLIP_MS + 30)`
- `onActivated` → `conn.fit`
- `attach()` の `fitAndSyncSize` と、その後の `requestAnimationFrame(() => fit(key))`

ズーム時、list mode では `.stage.zoomed.listmode .grid` が `left: -99999px` に移り、
拡大されるセルは `.zoom-main` へ Teleport される。ロースターから別セッションを拡大した場合、
そのセルは**直前まで画面外**にあり、`_isPaused === true` のまま `nextTick` の fit が走る。
IntersectionObserver の配信はフレーム末なので、`_sync` を実行する rAF のほうが先に来る。
`attach()` 経由（タブ切り替え等で再マウント）でも同じ窓に入りうる。

`FLIP_MS + 30` の遅い fit は、行数がすでに一致しているため `Terminal.resize()` の
早期 return で no-op になり、修復にならない。

## 直し方

**画面外の間は fit を保留し、戻ってきたときに実行する。**

- 判断のルールだけを純粋関数として `src/composables/terminalFitGate.ts` に置く
- `useTerminalConnections` は接続ごとに `IntersectionObserver` を1つ持ち、
  自分が所有する `c.host` を監視する。配信のたびに gate を更新し、
  保留していた fit があればその場で実行する
- gate は `fitAndSyncSize()` の中で1か所だけ効かせる。これで
  `fit` / `attach` / `setFont` / `rebuildTerminal` の全経路が同じ規則に従う

### なぜ「戻ってきたときに実行」で直るのか

配信バッチの中で fit すると、xterm 自身の observer コールバックも同じバッチで走り、
`_pausedResizeTask.flush()` でレンダラの寸法が追いつく。
`Viewport` の `_sync` は `addRefreshCallback`（次のフレームの rAF）なので、
**それが動く時点では寸法が新しくなっている**。observer の登録順に依存しない。
再現環境でこの修正を入れ、ズームの往復を繰り返しても再発しないことを確認済み。

### 保留して大丈夫な理由

- 新規スロットの gate は `onScreen: true` で始まる（xterm の `_isPaused` も false で始まる）。
  observer の初回配信より前に走る `attach()` の fit は素通りするので、
  spawn 時のジオメトリを URL に載せる #1178 の経路は変わらない
- 画面外のセルの fit を止めると、そのセルは前のサイズを保つ。見えていないので実害は無く、
  戻ってきた時点で必ず fit される。ズーム時に画面外の 8 セルへ一斉に resize を送らなくなる分、
  むしろ SIGWINCH の嵐が減る
- `IntersectionObserver` が無い環境（jsdom）では gate を開けたままにするので、既存の挙動のまま

## 変更するファイル

- `src/composables/terminalFitGate.ts`（新規・純粋関数）
- `src/composables/useTerminalConnections.ts`（observer と gate の配線）
- `test/src/composables/terminalFitGate.spec.ts`（新規・ルールの網羅テスト）
- `test/src/composables/terminalFitDeferred.spec.ts`（新規・実配線のテスト）
- `plans/fix-1762-phantom-scrollbar.md`（本ファイル）

## 検証

1. `yarn format` → `yarn lint` → `yarn build` → `yarn typecheck` → `yarn test`
2. 実機確認（負荷が落ちてから）: `yarn dev` を起動し、
   - ロースターから別セッションを拡大 → スクロールバーが出ないこと
   - ズームの往復を繰り返しても出ないこと
   - 通常バッファ（shell セル）ではスクロールバーが従来どおり出て、ドラッグで動くこと
   - ズーム後にエージェントへホイールが届くこと（従来どおり）
   - スクリーンショットを証跡として残す

## 上流

xterm.js 側の欠陥でもある（停止中のリサイズを先送りしたあと、viewport を再同期しない）。
本リポジトリの修正とは別に issue を立てる。
