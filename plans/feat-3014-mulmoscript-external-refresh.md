# feat(files): Canvas 表示中の MulmoScript を、外からの変更で描き直す (#3014)

## いま

Files ペインの Canvas 表示で MulmoScript の `.json` を開いていても、エディタ・git・エージェントの
Edit ツールなどプラグインの外からの書き換えは表示に届かない。プラグインの View が聞いているのは
`plugin:mulmoScript:scriptChanged` だけで、それはプラグイン自身の書き込みでしか流れない。

Markdown・HTML・ShapeScript は、View がファイル単位のチャンネル `plugin:<scope>:file:<path>` を購読し、
サーバーが購読されている間だけそのファイルを見張る（`server/files/documentWatch.ts`）ことで描き直している。

## 仕組み

プラグイン側の規則はすでにある: `scriptChanged` に `origin` が付き、View は自分の書き込みのこだまを無視し、
origin の無いイベントでは描き直す（`shouldReloadForScriptChange`）。ホストが足すのは「外からの変更で
origin 無しの `scriptChanged` を流す」ことだけ。

1. **ブラウザ**: `FilesCanvasView` が MulmoScript のカードを出している間、
   `plugin:mulmoScript:file:<card.data.filePath>` を購読する（中身は使わない。購読がサーバーの見張りの合図）。
2. **サーバー**: そのチャンネルの購読で、既存の `createDocumentWatchers` を使ってファイルを見張る。
   `filePath` はカードと同じ綴り（既定の stories 内なら `stories/<tail>`、それ以外は絶対パス）なので、
   ディスク上のパスに直してから、ワークスペース・各セッションの cwd・登録済みの stories の根に含まれるかを確かめる。
3. **変化したら**: origin 無しの `scriptChanged` を、チャンネルと同じ綴りの `filePath` で流す。
4. **自分の書き込みと区別する**: ホストの `onScriptChanged`（プラグインが書き込むたびに通る）で、そのファイルの
   印（mtime・サイズ・inode、`fileStamp` と同じもの）を同期的に覚えておく。見張りが変化に気づいたときに読んだ印が
   それと同じなら、プラグイン自身の書き込みなので流さない。判断に使うのは気づいたときの印で、読み直さない（読み直すと、
   その間のプラグインの次の書き込みが外からの変更を上書きし、こだまとして捨ててしまう）。まだ一致しない変更は少し待って
   から比べ直す（プラグインは書き込んでから報告するので、記録が付く前に見張りが自分の書き込みを見ることがある）。
   待っている間に購読が外れて付き直したら、古い見張りは流さない（新しい見張りが自分で流す）。
   気づいたときの印と見張っているファイルのパスは、見張りの部品が `announce` にそのまま手渡す（`AnnouncedChange`）。
   ファイルごとの共有の表から読むと、同じファイルを別の綴りで見張る見張りや古い世代の見張りに上書きされる。印の時刻はナノ秒
   （`mtimeNs`）。プラグインの書き込みは上書きで inode が変わらないので、ミリ秒では同じサイズの書き込みが重なる。View 自身の編集（`updateBeat` / `updateScript`）は必ず `scriptChanged` を
   出すので、編集中に描き直されることはない。エージェントがまるごと保存する `save` は `scriptChanged` を出さないので、
   見張りが拾って流す（エージェントの変更が画面に出る）。

## 決めたこと

| 論点 | 決定 |
| --- | --- |
| 対象 | Files ペインの Canvas 表示（issue の範囲）。Canvas ペイン（`GuiPanel`）のカードは今回入れない |
| root 付きのカード | Files ペインのカードは root を持たない（`storyWirePath`）。root を持つカードは描き直しの対象外 |
| 見張りの上限 | 既存の見張りとは別に `createDocumentWatchers` を一つ作る（上限も別） |
| スコープ名 | `"mulmoScript"` を `common/fileChannel.ts` の定数にし、ブラウザとサーバーで共有 |

## テスト

- 純粋な関数（`filePath` からディスク上のパス、自分の書き込みのこだまかどうか、カードから購読するチャンネル）を
  正常・異常の両方向で
- サーバー: 見張りが外からの変更で origin 無しの `scriptChanged` を流し、プラグイン自身の書き込みでは流さないこと
- 実際の画面で: Canvas 表示中のファイルを外から書き換えると描き直され、View の中での編集では描き直されないこと
