# ガイド：CSV の分析と、表を追いかけるグラフ（#3101）

`docs/guide/{en,ja}/spreadsheet.md` に「データを最初から最後まで分析する」の節を足す。頼み方、エージェントがすること、出てくるもの（シートの分け方、計算式と計算済みの値、表から描いたグラフ）、データを直して変わるのを見る、読み直しを頼むとき、保存される場所。「頼み方」の短い項目はこの節を指す。

## スクリーンショット

`docs/guide/images/spreadsheet-analysis-*.png`。撮り方：

- 使い捨ての `HOME`（`.mulmoterminal/config.json` は空、`.zshrc` は `PROMPT='%1~ $ '`）、別のポートでサーバーを立てる。
- 合成した 61 日分のカフェの売上の CSV を作業領域の `data/` に置く。
- シェルのセルのセッションに向けて、MCP の口から `presentSpreadsheet` と `presentChart`（`source` 付き）を呼ぶ。
- Playwright（`deviceScaleFactor: 2`）で撮って縮める。
- 編集は、画面の編集欄で 6/1 のアイスを 15 から 110 に直す。前と後は、相関の表と散布図を一枚にまとめる。
- グラフは Canvas を広げたあとでウィンドウの大きさを変え、広い幅で描き直させてから撮る（ECharts はウィンドウの大きさが変わったときだけ描き直す）。
