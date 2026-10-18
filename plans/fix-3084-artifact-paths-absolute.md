# 道具が返す artifacts/ のパスを絶対パスにして Claude に渡す（#3084）

## 問題

プラグインは保存先を作業領域から見た相対パス（`artifacts/spreadsheets/…json`）で返す。プロジェクトのセルの Claude はプロジェクトのディレクトリにいるので、このパスは何も指さない。`presentSpreadsheet` の「そのファイルを読んで今の値を見て」が失敗する。

## 方針

- `server/mcp/broker.ts` で Claude に返す文（narration）だけを書き換える。GUI に渡す `data` は相対のまま（View はそのパスで読み書きする）
- 書き換えは `server/mcp/narration-artifact-paths.ts` の純粋関数。行頭か空白・引用符・括弧の直後の `artifacts/<…>` だけを対象にし、`/` の直後（すでに絶対）・`..` を含むもの・末尾の句読点は扱わない
- 道具ごとではなく一箇所で直すので、`presentChart` など同じ形の道具にも効く。STL / USDZ はすでに絶対パスを返しているので変わらない

## 範囲外

- `artifacts/` で始まらない形で保存先を返すもの
