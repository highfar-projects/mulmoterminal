# 表の関数（workbook functions）を分析で使う（#3097 の MulmoTerminal 側）

表のプラグイン 4.2.0（receptron/GUIChatPluginSpreadsheet#117 ほか）で、表が自分の関数を持てるようになり、統計の関数も増えた。MulmoTerminal 側でそれを使う。

## 変えたこと

- 依存：`@gui-chat-plugin/spreadsheet` を `^4.2.0` に。QuickJS（`quickjs-emscripten-core`、`@jitl/quickjs-singlefile-mjs-release-sync`）はその依存として入る。
- 分析スキル（`mulmoterminal-data-analysis`）の「3. 表」：
  - 使える関数の一覧を 4.2.0 に合わせた（検定と分布、回帰と予測、分布の形、条件付きの最大・最小）。
  - 関数に無い手法は、値を貼る前に**表の関数**にする（シートの `functions`、例：`MOVING.AVG`）。書き方と制限（50ms、範囲は行の配列、`A:A` は不可、名前の決まり、返事で使えないと言われたら直す）。
  - 値として入れるのは、表の外のデータが要るものと重すぎるものだけ。
  - 回帰の線は `TREND` / `FORECAST.LINEAR` の列から描けば、表に追いつく。
  - 表を直されたあとに出し直すときと、分析をスキルとして残すときは、`functions` をそのまま運ぶ。
- ガイド（en/ja）：使える関数の表を 4.2.0 に。新しい節「表の関数を作る」。「表にない統計」を今の範囲に直した。

## 確かめたこと

- `rm -rf node_modules && yarn install --frozen-lockfile` のあと、`yarn lint` / `typecheck` / `build` / `test`。
- ビルドで QuickJS は別の塊に分かれ、関数を持たない表では読み込まれない。
- 隔離したサーバーで、ワークスペースのセルから MCP で `presentSpreadsheet`（`MOVING.AVG` を持つ表）と、その範囲を `source` にした `presentChart` を出した。表はブラウザで、グラフはサーバー（Node）で関数を計算し、どちらも 3 日平均（127.67 から）が出た。コンソールの誤りは無し。

エージェントが自分からこの手順に従うかは、まだ試していない（`claude -p` の上限が戻ってから）。
