# feat: パスメニューの "Browse files in the app" は右ペインで開く (#1910)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 現在のコードの仕様はコードが唯一の情報源。数値は sha に紐づけて書くこと。

## きっかけ

#1859（ツリー行からパスをターミナルに挿入したい）を試している最中に、
「ファイルエクスプローラーを開くと右ではなく画面全体になる」という報告があった。

調べると、入口によって**別々の実体**が開いていた。

| 入口 | 開くもの |
|---|---|
| 拡大セルのヘッダーのフォルダアイコン | 右ペイン（`FilesPane`、`TerminalGrid` の `zoom-row` 内） |
| パスメニューの "Browse files in the app" | 全画面（`FilesOverlay`、`/files?cwd=` ルート） |
| global header の Files | 全画面。ただし `CONTENT_ROUTES` でしか描画されないので **grid には元々出ていない** |
| ヘッダー設定の `open.files` ボタン | 全画面 |

右ペインに辿り着く入口は 1 つだけで、しかもそれは**拡大していないと存在しない**
（`CellChromeButtons.vue` のボタンが `v-if="expanded"`、`TerminalGrid.vue` の `zoom-row` が
非拡大時は `hidden`）。タイル表示のままファイルを見ようとすると必ず全画面に飛ぶ。

## 決めたこと

パスメニューの**項目構成は変えない**。global header も変えない。
**"Browse files in the app" の行き先だけ**を右ペインに変える。

検討して**採らなかった案**:

- **grid の global header にも Files を出す。** 全画面への入口を残すために提案したが、
  ボタンを増やさない判断。結果として grid から全画面 Files への入口は無くなる（下記の割り切り）。
- **パスメニューに「右ペインで開く」「全画面で開く」の 2 項目を置く。** 押すたびに
  どちらか考えることになるので却下。
- **`openCanvasFor` を一般化して共用する。** あちらはクリック起点でない呼び出しのために
  `enlarge` / `stillWanted` を持つ。こちらはどちらも要らないので、使わない引数が 2 つ残る。

## 割り切り（PR の Items to Confirm に書く）

**grid view から全画面 Files に行く入口が無くなる。** global header の Files は
`CONTENT_ROUTES`（Collections / Feeds / Wiki / Accounting）でしか出ないため
（`AppToolbar.vue` の `inContent`）。content view からは従来どおり。

## 実装

`open-canvas` が既に「拡大 **かつ** ペインを開く」を 1 ジェスチャでやっている。同じ形をなぞる。

1. `src/components/gridCell.ts` — `GridCellEmits` に `"open-files"` を追加。
   `toggle-files` とは**別のイベント**。あちらはタイルセルで押されたとき
   「このセルが拡大されたら何を開くか」を記録するだけで、拡大はしない（#1378）。
2. `src/components/TerminalCell.vue` — `browseFiles()` を `emit("open-files")` に。
   `filesGotoIndex` の import が未使用になるので削除。
3. `src/components/TerminalGrid.vue` — `openFilesFor(uid)` を追加、`gridCellEvents` に配線。

```ts
async function openFilesFor(uid: number): Promise<void> {
  if (filesOpen.value && paneUid.value !== uid && (await filesPane.value?.flush()) === false) return;
  if (props.expandedUid !== uid) emit("toggle-expand", uid);
  setRightPane("files", uid);
}
```

flush の条件が `openCanvasFor` と違うのは、**何が unmount されるかが違う**ため。
Canvas は files ペインを必ず置き換えるので無条件に flush する。こちらは
ペインが既にそのセルにあるなら何も動かない（`filesOpen` は「画面に出ているペイン」＝
`paneUid` のもの、という意味なので、`paneUid !== uid` が「別のセルの files ペインが
これから移動する」ちょうどの条件になる）。

トグルにはしない。"Browse files in the app" は「見せて」であって「切り替えて」ではない。
`openCanvasFor` も閉じない。

## テスト

- タイル状態のセルのパスメニューから押す → そのセルが拡大され、右ペインが files で開く。
- 拡大済みのセルから押す → 拡大は起きず、ペインだけ開く。
- 別セルの files ペインに未保存バッファ → flush が呼ばれ、false なら何も動かない。
- 同じセルに files ペインが既にある → flush を呼ばない。
- `TerminalCell.spec.ts` — メニュー項目がルーターを叩かず `open-files` を emit する。

`gridCanvasAutoExpand.spec.ts` が Canvas 側で同じ形を固定しているので構造を借りる。

## ドキュメント

- `docs/guide/{en,ja}/basics.md`、`docs/guide/{en,ja}/config.md` — パスメニューの説明。
- `server/skills/mulmoterminal-header/SKILL.md` — ユーザーが自分のヘッダー設定に書ける
  `{ "open": { "files": "${dir}" } }` が**同じラベル**で例示されている。こちらは
  **全画面のまま**。`open.files` は任意のパスを取れるが、ペインは拡大セルの cwd に強制的に
  re-root する（`FilesPane.vue` の defineExpose のコントラクト —— pane は `cwd` prop を
  自分では watch しない）ので、ペインでは仕様上応えられない。同じラベルで挙動が分かれるため、
  skill の文言で差を明記する。
- 日付入りガイド（`v2.2.0.md` / `v4.4.0.md`）は**スナップショットなので触らない**。

## この次

#1859（ツリー行を右クリック → パスをターミナルに挿入）は別 PR。
右ペインに辿り着きやすくなるほど効く機能なので、順番はこちらが先。
