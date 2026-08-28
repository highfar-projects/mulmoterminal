# fix(ui): CopyCodeBlock が渡された class を落とす (#1895)

> 時系列のログであって現状の仕様書ではない。

## 症状（実測で再現）

`TerminalCell` は他のセルボタンと同じ `CELL_BTN` を渡している:

```vue
<CopyCodeBlock v-if="sessionId" :class="CELL_BTN" :session-id="sessionId" ... />
```

`CopyCodeBlock` のテンプレートはルートが 2 つ（`<span>` と `<Teleport>`）なので Vue は
attribute を自動継承できず、**class はどこにも載らずに消える**。unit で観測:

```text
ROOT html: <span class="relative inline-flex"><button class="cell-btn" ...
button has MARKER_CLASS: false
warnings: 1   ← [Vue warn] Extraneous non-props attributes (class)
```

実アプリ（claude セル、Chrome）でも確認。`.cell-btn` は CSS 規則を持たないマーカーなので、
ボタンはブラウザ既定の chrome で描かれる:

| | class | border | background | サイズ |
|---|---|---|---|---|
| 修正前の copy ボタン | `cell-btn` のみ | `2px outset` | `rgb(239,239,239)` | 19.2 × 17.3px |
| 隣のセルボタン | CELL_BTN 一式 | `0px none` | transparent | 26 × 28px |

## issue が提案していた案1 は「直ったように見えて直らない」

issue は 2 案を挙げていた。案1 は「`Teleport` を `<span>` の中へ入れて単一ルートにする」。
**実際に当てて測った:**

```text
ROOT html: <span class="relative inline-flex MARKER_CLASS"><button class="cell-btn" ...
button has MARKER_CLASS: false
warnings: 0
```

**警告は消えるが、class は外側の `<span>` に載り、ボタンは unstyled のまま。** しかも
`h-[26px] w-7` がラッパーに付くので、状況としては少し悪くなる。

理由は `CELL_BTN` の中身がボタンの装飾だから —— `bg-transparent border-none h-[26px] w-7
cursor-pointer hover:bg-hover`。repo の他の使い方も全て `<button class="cell-btn"
:class="CELL_BTN">` と**ボタン自身**に載せている（`TerminalCell.vue:1434,1437`,
`LauncherCell.vue:77` 等）。`CopyCodeBlock` の button だけがマーカーしか持っていなかった。

## 採った直し方 —— 案2

`defineOptions({ inheritAttrs: false })` + 内側の `<button>` に `v-bind="$attrs"`。
**行き先を推測（継承）に任せず名指しする。** ラッパーの `<span class="relative inline-flex">`
はそのまま残す —— 一時表示される note がそこに絶対配置されるため。

副次的な利点として、将来 2 つ目のルートを足しても壊れない。

## 検証

**unit（`test/src/components/codeBlockCopy.spec.ts` に 5 件追加）**

すべて **button** に対して assert する。これは細部ではなく要点で、`wrapper.classes()` に
書いたテストは案1 の「直ったように見える」修正を通してしまう。

> 最初 `wrapper.element` に対して書いたが、multi-root コンポーネントではそれが test-utils の
> コンテナ `<div data-v-app>` で、**class が絶対に載らない要素を見る空振りのテスト**だった。
> 実際のルート要素（`firstElementChild`）を見るヘルパに直し、その理由をコメントに残した。

| ミューテーション | 結果 |
|---|---|
| 出荷時の状態に戻す（`inheritAttrs` も `$attrs` も無し） | 2 red |
| **issue の案1**（単一ルート化、class は span へ） | 2 red |

**実機**（claude セル、Chrome、`getComputedStyle` で隣のボタンと比較）

| | border | background | 高さ | 幅 | font | cursor |
|---|---|---|---|---|---|---|
| copy ボタン | `0px none` | transparent | 26px | 28px | 16px | pointer |
| 隣（Move terminal left） | `0px none` | transparent | 26px | 28px | 16px | pointer |

完全一致。`Extraneous non-props attributes` の警告は 0 件。

> 修正前の実機測定では警告が **0 件**だった —— production build は dev の警告を落とすため。
> つまり配布物では**見た目だけが症状**で、警告は `yarn dev` でしか見えない。issue が
> dev サーバで見つけたのはそのため。unit 側で警告を固定してあるのはこの穴を埋めるため。

ゲート: `format` / `lint` / `typecheck` / `build` / `test` すべて exit 0、
`yarn test` **11659 passed / 50 skipped**。
