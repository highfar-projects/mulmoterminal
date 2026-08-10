# fix(#1591): ヘッダー上のチップが headerColor に追従せず読めなくなる

## 症状

ディレクトリの `.mulmoterminal.json` で `headerColor` を彩度の高い色にすると、セルヘッダー上の
`Sonnet · ctx 39%`（model/context バッジ）と `↑90.9M ↓712k`（usage チップ）が背景と同化して読めない。
隣の path（`Home`）とタイトルは追従しているのに、この 2 つだけが取り残される。

## 原因

ヘッダーの ink は `--cell-header-fg`（`headerTextColor` から `cellHeaderStyle.ts` が出す CSS 変数）を
先に見る、という規約がすでにある。

- `CELL_DIR` … `text-[var(--cell-header-fg,var(--text-dim))]`
- `GitBranchChip` / `WorkItemChip` / `WorktreeEnvChip` … `text-inherit` ＋ `currentColor` 由来の塗り

取り残されていたのは、規約に接続されていない 3 つだけ。

- `ModelContextBadge.vue` … `text-dim`
- `TerminalCell.vue` の usage チップ（`data-testid="cell-usage"`）… `text-dim`
- `TerminalCell.vue` のカスタムチップ（`data-testid="cell-hdr-chip"`）… `text-dim`

`text-dim` はテーマのパネル面に合わせて選ばれた色なので、ディレクトリ色で塗られたヘッダーの上では
「背景に近い色」になり得る。

## 方針（最小・接続のみ）

チェーンを 1 本の定数にして、3 箇所をそこに接続する。`headerTextColor` 未設定時に `headerColor` から
自動導出する案は**採らない**（下記「やらないこと」）。

1. `cellChromeClasses.ts` に `CELL_HEADER_INK_DIM = "text-[var(--cell-header-fg,var(--text-dim))]"` を追加し、
   既存の `CELL_DIR` もそれを使う（同じ文字列が 2 箇所に並ぶのを避ける）。
2. `ModelContextBadge.vue` / usage チップ / カスタムチップを `CELL_HEADER_INK_DIM` に接続。
3. spec で固定する。変数名は `cellHeaderStyle.ts` との契約なので、定数ではなくチェーンの
   **リテラル**を assert する。
   - `test/src/components/ModelContextBadge.spec.ts`
   - `test/src/components/TerminalCell.spec.ts`（両チップを描画済みの既存テストに追加）

未設定のディレクトリでは `--cell-header-fg` が無いのでフォールバックの `--text-dim` が効き、
見た目は現状と 1px も変わらない。

## やらないこと（と、その理由）

- **`headerTextColor` 未設定時の自動導出**（`headerColor` から WCAG で白/黒を決める）。
  `working` / `done` ではヘッダー背景が状態色に置き換わる（`cellStatusClasses.ts` の `HEADER_STATUS`）ため、
  明るいテーマ＋濃い `headerColor` だと導出した白文字が薄緑の上に乗って**かえって読めなくなる**。
  「dir 色を常に塗るヘッダー」と idle のセルヘッダーに限定する追加設計が要るので、別 issue に切り出す。
- **`RateLimitGauge.vue`**。issue 本文は原因として挙げているが、これは `AppToolbar.vue` にしか置かれておらず
  （アプリのツールバー）、`headerColor` の影響を受けない。`ctx %` を出しているのは `ModelContextBadge.vue`。
- **コックピットロースターの `reply` 行**。ディレクトリ色を塗るのは行の上部バー（`CockpitHeader`）だけで、
  本文の背景は `rosterAlertClasses.ts` のテーマ面（`bg-panel` ＋ 状態ウォッシュ）。`headerColor` の上には
  乗っていないので、この修正の対象外。読みにくさが残るならテーマ側（`--text-dim` のコントラスト）の別件。
- **カスタムチップの `border-border`**。ヘッダー上で薄くなるのは ink と同じ理屈だが、`border-current` にすると
  未設定時の見た目が変わるため、最小の範囲から外した。

## 検証

- `yarn format` / `yarn lint` / `yarn typecheck` / `yarn build` / `yarn test`
- 実機: `headerColor` を設定したディレクトリのセルで、ctx / usage / カスタムチップが
  `headerTextColor` に追従すること。未設定のディレクトリで見た目が変わらないこと。
