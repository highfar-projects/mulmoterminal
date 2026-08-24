# ガイドのデモ動画に poster を付ける

Issue: #1842（#1828 / #1840 のフォローアップ）

## 背景

`docs/guide/{en,ja}/index.md` のローンチデモ動画は、再生前に無地の灰色の箱と再生ボタンだけで表示される（GitHub Pages を macOS Safari で 2 回観測）。`<video>` に `poster` が無く `preload="metadata"` のため、Safari が最初のフレームを描いていないのが原因と推測。動画の 0 秒目は暗い単一セルの画面なので、仮に描かれても何の動画かは分かりにくい。

## 変更

1. **`docs/guide/videos/launch-demo-poster.png`** — 日本語版の 24 秒目（グリッド 9 セルに色が付き、タイトルカード `working / done / needs you` が乗っている場面）を出力側シーク（`-i` の後ろの `-ss`）で抜く。1280x720 PNG、315 KB。en / ja は画面が同一なので 1 枚で共用。写っているのはデモ用の `acme-*` プロジェクトだけ
2. **`docs/guide/ja/index.md` / `docs/guide/en/index.md`** — `<video …>` 開始タグに `poster="../videos/launch-demo-poster.png"` を足す。他の属性は変えない
3. **`docs/guide/videos/README.md`** — inventory の表に poster を足し、なぜ要るか・どう抜いたか・再レンダー時に抜き直すことを書く

## 確認

- 抜いた PNG が、選定時に見せたフレーム（入力側シークで抜いたもの）と md5 一致すること（CFR の mp4 なので両シークで同じフレームになる）
- Pages デプロイ後に、`<video>` に `poster` 属性が出ていることと PNG の URL が 200 を返すこと
