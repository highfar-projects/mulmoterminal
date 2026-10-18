# グラフが表を追いかける、統計を計算式で書く（#3096 案 A、#3097 案 A）

## 何が変わるか

- グラフが表の範囲を指せる（`charts[i].source = { spreadsheet, range }`）。表が保存されると、開いているグラフが描き直される。
- 表に統計の関数が入った（`CORREL`、`PERCENTILE`、`QUARTILE`、`RANK`、`SUMIFS` など）。分析のスキルは、これまで値で入れていた統計を計算式で書く。

## 依存するパッケージ

- `@gui-chat-plugin/spreadsheet`：統計の関数（receptron/GUIChatPluginSpreadsheet#68）と `readCalculatedRange`（同 #70）
- `@mulmoclaude/chart-plugin`：`source` と `sources` の口（receptron/mulmoclaude#3508）

どちらも npm に公開してから、このリポジトリの版を上げる。

## MulmoTerminal の変更

- `server/backends/plugins/chartSources.ts`：`sources.read` を `readCalculatedRange` で実装する。エージェントは表の**絶対パス**を伝えられる（`mcp/narration-artifact-paths.ts`）ので、作業領域の中の絶対パスを `artifacts/…` に直してから読む。
- `server/infra/tools/plugins-registry.ts`：`presentChart` の `execute` の文脈に `sources` を足す。道具の呼び出しも画面の dispatch も同じ `execute` を通る。
- `server/backends/files/fileChange.ts`：scope `chart` で `artifacts/spreadsheets/…json`（相対でも絶対でも）を見張る。画面はエージェントが書いたままのパスで購読するため。
- `src/plugins-registry.ts`：グラフの画面を runtime で包む（scope `chart`）。
- `server/skills/mulmoterminal-data-analysis/SKILL.md`：統計は計算式で、表のデータのグラフは `source` で描く。表に計算済みの値が無く、グラフがすべて表を追いかけるなら、読み直しで表を出し直さない。
- `docs/guide/{en,ja}/spreadsheet.md`：使える関数、グラフが表を追いかけること、制限。

## 確かめたこと

- 手元でビルドした二つのパッケージを入れ、別のポートと使い捨ての `HOME` でサーバーを立てた。表を指すグラフ（絶対パス）が計算した値で描かれ、表の保存の dispatch でセルを直すと、開いたままのグラフが描き直された。
- 読めない範囲を指すと、`presentChart` は何も保存せず、理由をエージェントに返した。
