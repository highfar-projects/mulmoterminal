# feat(#2136): 開いている Markdown ビューをディスクの変更に追随させる

別セルのエージェントが `.md` を書き換えたとき、開いたまま見ている表示が追随してほしい。
現状はブラウザのフルリロードだけが更新の契機になっている。

## 決定事項

**未保存の編集があるとき、プレビューはディスクに従う。** プレビューは元々ディスクの内容を
サーバーがレンダリングしたものであり、保存前から既にエディタとは違うものを映している。
「ディスクに従う」はその性質をそのまま保つ選択で、dirty のときに固まる方が説明しづらい。
バッファの扱い（clean なら取り込む / dirty なら競合バナー）は既存のまま変えない。

## PR を2本に分ける

段階1（クライアントのキャッシュバスト）と段階2（サーバーの監視）は**独立して revert できる**。
段階1 単独で Files ペインのプレビューは追随し、段階2 単独で Canvas カードは追随する。

---

## 段階1 — プレビューを version でキャッシュバストする

`previewSrc` は `openPath` だけから計算されるので、ディスクが変わっても URL が変わらず、
ブラウザは再取得しない（`src/components/FilesPane.vue`）。

検出側は既にある。`checkForExternalChange` が `/api/files/browse/version` のポーリングと
`FILE_WRITE_CHANNEL` の購読で外部変更を拾い、clean なら `loadFile` して `baseVersion` を
更新する。`FILE_WRITE_CHANNEL` を publish するのは Claude Code の hook ルート
(`server/routes/hook-routes.ts`) なので、**Claude セルの編集は即時**、codex や外部エディタは
ポーリング間隔ぶん遅れて届く。

やること:

1. プレビューが映すディスクの version を `previewSrc` に混ぜる。`/api/files/browse/md` は
   `cwd` と `path` しか読まない（`server/files/files-browse.ts` → `containedFor`）ので、
   余分なクエリは無害に無視される。
2. dirty のときの version は競合バナーが持っている（`conflict.version` = 検出時にディスクに
   あった version）。clean のときは `baseVersion`。「ディスクに従う」はこの2つの合流で足りる。

### 段階1 で意図的に触らないところ

`checkForExternalChange` は競合バナーが立っている間ポーリングを止める。したがって競合中に
ディスクがさらに書き換わっても、プレビューは競合検出時の内容のまま止まる。「ディスクに従う」を
そこまで徹底するにはポーリングの早期 return と、バナーが持つ version の更新に手を入れることに
なり、それは競合バナーの挙動そのものの変更なので、プレビューの PR では触らない。

### issue に無い前提条件 — `loadFile` が Preview を解除する

`loadFile` は毎回 `showPreview` を false に落とす。外部変更を検出した `loadFile(pathRel, true)`
もこれを通るので、**追随した瞬間にユーザーが Edit に飛ばされる**。version を混ぜるだけでは
プレビューは更新されたように見えない。

開いているファイルの強制再読み込みは「開き直し」ではなく「更新」なので、表示モードを
落とすのは**別のファイルを開くときだけ**にする。`mayLeaveCurrent` の作りから、
`pathRel === openPath` で `loadFile` に到達するのは force のときだけ（外部変更の取り込みと、
競合バナーの Reload）で、どちらも表示モードを保つのが正しい。

これは #2137（開き直したときにモードが戻る）とは別。あちらは「別のファイル / 開き直し」側で、
ここで触るのは「開いたままの再読み込み」側。

### テスト

`test/` の Vitest に、純粋な部分を関数として切り出して当てる:

- version が変われば preview の URL が変わり、変わらなければ同一であること。
- dirty で競合が立っているときは競合の version、clean のときは `baseVersion` を使うこと。
- 同じファイルの強制再読み込みでは表示モードが保たれ、別のファイルを開くと落ちること。

---

## 段階2 — 開かれている文書をサーバー側で監視し、既存の publisher を呼ぶ

publish の呼び出し元はアプリ自身の save 経路だけ（`server/backends/markdown.ts` /
`html.ts` / `shapescript.ts`）。fs 監視は `server/backends/collectionWatchers.ts` しか無く、
markdown は対象外。したがってセル内のエージェントが `.md` を Edit してもどのチャネルにも
publish されず、Canvas の `presentDocument` カードは一切更新されない。

### 何をトリガーに監視を張るか

購読チャネルは `plugin:<scope>:file:<path>`（`@mulmoclaude/core/file-change` の
`pluginFileChannel`）。**購読が付いたら監視を張り、最後の購読者が消えたら畳む。**
ワークスペース全体の再帰監視は不要。

`server/infra/pubsub.ts` の `subscribe` / `unsubscribe` ハンドラは `createPubSub` の内部に
閉じていて外から拾えない。socket.io の adapter が出す room イベント
(`create-room` / `delete-room`) を購読すれば、切断による離脱も同じ経路で拾えるので、
subscribe ハンドラ自体には触らない。

### パスの名前空間 — 正規化しない

`publishFileChange(rel)` は**渡された文字列そのもの**からチャネル名を作る。`presentDocument`
の `path` は絶対パスにもなり得る（`backends/markdown.ts` のコメントが既にその前提）。
一方 Files ペインの `openPath` は `props.cwd` 相対で、`cwd` はワークスペース root とは限らない。

つまり同じファイルでも購読者ごとにチャネル文字列が違い得る。ここで正規化を発明すると共有
パッケージの意味論に踏み込むので、**チャネル文字列を鍵にする**: room の path をそのまま
絶対パスに解決して stat し、変化したら**同じ文字列で** `publishFileChange` を呼ぶ。
どの購読者も自分が張ったチャネルで更新を受け取り、正規化は要らない。

### 監視の方式 — fs.watch ではなく mtime ポーリング

- エージェントの書き込みは temp → rename で、**パス指定の `fs.watch` は rename で死ぬ**。
- Windows では 8.3 短縮パスに対する `fs.watch` がプロセスごと落とす
  (`docs/windows-gotchas.md`)。`server/session/codex-activity-watch.ts` が同じ理由で
  意図的にポーリングを選んでいる前例。

`codex-activity-watch.ts` の形に倣う: 依存を注入した純粋なループにして、fs とタイマーを
持たないテストから駆動できるようにする。

### 封じ込め

room 名に含まれる path は client 由来。stat する前に `resolveContained`
(`server/files/pathContainment.ts`) 相当のゲートを通す。

### Files ペインもこのチャネルを購読する

段階2 の監視は「購読者がいる」ことで起動するので、Canvas カードが無い状態では何も動かない。
Files ペインが開いているファイルのチャネルを購読することで、(a) 監視が起動し、
(b) ポーリング間隔を待たずに codex や外部エディタの書き込みにも追随する。

### 共有パッケージの規約

`publishFileChange` は MulmoClaude と共有だが、**監視はホスト側に置く**のでチャネル名と
ペイロードは不変。MulmoClaude 側にも markdown の fs 監視は無い（両ホストとも「アプリ自身が
保存したときだけ publish」）ので、core に監視を入れると MulmoClaude の挙動を変えることになる。
ホスト側に置く限り乖離にならない。

## 検証

build / lint / typecheck が通っても描画は保証されない。実機で確認する:

1. `.md` を Files ペインで開き Preview に切り替える
2. 別プロセスから同じファイルを書き換える（atomic write も含める — rename 経路が本番の形）
3. リロードせずにプレビューが変わり、**Preview のまま**であること
4. Canvas に `presentDocument` で出したカードが同じ書き換えで更新されること
5. 未保存の編集があるときの挙動が上の決定どおりであること

スクリーンショットとコンソールログを証跡として残す。
