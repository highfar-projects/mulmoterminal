# fix: PDF 書き出しで Mermaid の fence を図として印刷する

Issue: #3214

## 問題

キャンバス（`presentDocument` の View）は ` ```mermaid ` の fence を図として描く。同じ文書を View の PDF 書き出しに通すと、`server/backends/plugins/markdown.ts` の `exportPdf` が素の `marked` の出力を puppeteer で印刷するだけなので、fence はコードブロックのまま紙になる。全画面プレビュー（`/files`）には #2991 で描画が入ったが、PDF はキャンバスの描画もプレビューの描画も通っていなかった。

## 方針

PDF は puppeteer のページで組まれるので、印刷する前にそのページで描く。新しい描画は書かず、プレビューのものを二つ借りる。

- **置き場所**: `diagramFenceRenderer`（`server/files/previewMermaid.ts`）で ` ```mermaid ` の fence を「隠した placeholder と、marked 自身が作るコードブロック」にする。他の fence は marked の既定の描画器（`new Renderer().code`）がそのまま描くので、Mermaid を含まない文書の HTML は以前の `marked.parse` と一致する。
- **描き方**: プレビューの module script は `import mermaid from <url>;` の一行と、描く本体からなる。本体を `drawDiagramsSource(theme)` として切り出し、module script はその前に import の一行を足したものにする（文字列として以前と同一）。PDF のページには mermaid の単一ファイル版（`node_modules/mermaid/dist/mermaid.min.js`。読み込むと `globalThis.mermaid` が立つ）を `page.addScriptTag` で入れ、同じ本体を `async` の即時関数に包んで `page.evaluate` する。ページは `about:blank` で、サーバーから import する経路が使えないので、単一ファイル版を使う。
- **紙の上の見え方**: 描けた fence は図だけ。プレビューが折りたたむ「Diagram source」の disclosure は紙では開けないので、折りたたまれたものは `display:none` にし、summary も消す。描けなかった fence はプレビューと同じく、エラー行と開いたままのコードブロックが残る。図は `break-inside: avoid` で途中改ページしない。
- **テーマ**: 紙は白なので mermaid の `default` 固定。
- **待ち時間の上限と失敗**: 描き終わらないページを待ち続けると要求とブラウザが解放されないので、`DIAGRAM_DRAW_TIMEOUT_MS` を過ぎたら諦める。描画が投げたとき（mermaid が入らない、本体の誤り）も同じで、PDF ごと失敗させず、理由をログに残す。どちらの場合も **`about:blank` へ移ってから文書を敷き直し、それを印刷する**。諦めた描画はページの中でまだ走っているので、そのまま印刷すると「期限から印刷までに置き換わった分だけ図、残りはブロック」という再現できない紙になる（Codex の指摘）。`setContent` だけでは同じ窓の中で文書を書き直すだけで、走っている描画の約束はその窓に残る。ナビゲーションで窓ごと捨ててから敷き直せば、pending の placeholder は隠れ、開いたままのブロックが出るので、以前の PDF と同じ見え方に決定的に落ちる。

## 変更

- `server/files/previewMermaid.ts` — `drawDiagramsSource(theme)` を公開。`mermaidBootstrapTag` の出力は不変。
- `server/files/mermaidAssets.ts` — `mermaidBundlePath(dist)`。単一ファイル版はディスクから読むだけで、配信経路の許可リストには載せない。
- `server/backends/plugins/markdown-pdf.ts`（新規）— `markdownPdfDocument`（印刷する HTML と図の数）、`drawDiagrams`（注入と描画、上限つき）、`printMarkdown`（組んで、描いて、印刷）。印刷用 CSS もここへ移した。
- `server/backends/plugins/markdown.ts` — Marp でない分岐を `printMarkdown` に委ねる。Marp の分岐は触らない。

## 検証

- **変わらないことの確認**: `mermaidBootstrapTag` を旧版（`git show main:server/files/previewMermaid.ts`）と新版で、テーマ三種と生成した URL・nonce の組で比べ、全件一致を確認した（scratchpad の差分 harness。件数は実行時の出力に残す）。Mermaid を含まない文書の HTML が `marked.parse` と一致することは、spec に生成入力の性質として常設した。
- **spec**: `test/server/backends/plugins/markdownPdf.spec.ts`（placeholder の形、図の数、Mermaid なしの文書の同一性、注入する bundle の場所、評価する本体、上限で戻ること、図がなければ注入しないこと）。`test/server/files/previewMermaid.spec.ts` に本体の切り出しを固定。`test/server/files/mermaidAssets.spec.ts` に単一ファイル版の実在と、立てる global を固定。
- **実機**: puppeteer を実際に起動し、正しい fence 二つ・壊れた fence・他言語の fence を含む Markdown を `printMarkdown` で PDF にし、ページのスクリーンショットと PDF の一ページ目の画像で、図が描かれ、壊れた fence がエラー行とコードブロックで残り、他の fence が以前と同じであることを目で確認した。`pdftotext` で、描けた図の文字がラベルとして入り、ソースはコードブロックとして入っていないことも確認した。
- **壊して回る**: module script に改行を一つ足すと差分 harness が全件不一致になること、PDF 用の style を落とす・図がなくても注入する・本体を包まない・上限で「描けた」と答える・他の fence の描画器を替える・単一ファイル版の代わりに ESM の入口を指す・紙にダークテーマを使う・注入を省く、のそれぞれで spec が赤になることを確認し、ソースが元どおりであることを `cmp` で確かめた。
- View のボタンから `exportPdf` までの配線は変えていないので、そこは実機では通していない。

## 決めたこと・残したこと

- 数式（`$…$`）は同じ経路の同じ抜けだが、別の仕組み（`previewMath.ts`）なので別の PR にする。
- Marp の経路で Mermaid がどうなるかは未確認のまま。
- 参照実装 `../mulmoclaude` の PDF も Mermaid を描かない。今回は意図した差異で、理由は「キャンバスで見えるものを紙にも出す」。
