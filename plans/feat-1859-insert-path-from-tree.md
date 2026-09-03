# feat: ファイルペインのツリー行からパスをターミナルに挿入する (#1859)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 現在のコードの仕様はコードが唯一の情報源。数値は sha に紐づけて書くこと。

## 出発点

ツリー行はクリックして開く以外に何もできず、「このファイルを見て」と言うたびに
パスを手で打っていた。挿入という操作自体はアプリに既にある（ドロップ #750 / #993、
スクリーンショット貼り付け #938、ヘッダーの `pick-file` #319）。足りないのは、
**既に画面に開いているツリーからそれを起動する入口**だった。

#1910 で「Browse files in the app」が右ペインを開くようになり、ペインに辿り着く経路が
増えた。この機能はそのぶん効く。

## 決めたこと（issue の 4 つの問いへの回答）

1. **相対と絶対の両方**をメニューの 2 項目にする。場面によって要るものが違う。
2. **修飾キーではなく右クリック**（+ キーボードから届くよう `Shift+F10` と `ContextMenu` キー）。
   Cmd+クリックは発見しづらく `keymap` とも衝突しえる。メニューなら項目名で何が起きるか読める。
3. **ディレクトリ行にも出す。末尾スラッシュは付けない。**
4. **全画面 Files では出さない** —— 宛先のターミナルが無い。

`canvasTarget` prop + `open-in-canvas` emit が「隣にセルがあるときだけ Canvas ボタンを出す」を
既に同じ形でやっているので、`insertTarget` + `insert-text` として倣った。

## 実装中に確定した罠

**ペインのルートと、画面に見えているターミナルはズレる。** 未保存バッファを保存も退避もできず
re-root を断ったとき、`paneCwd` / `paneUid` は古いセルに留まり `expandedUid` だけが動く。
この状態で相対パスを見えているターミナルに入れると**別プロジェクトの、実在する別ファイル**を
指す。

対処: 挿入先は `expandedUid` に固定し、ペインには**そのセルの cwd**（`expandedCwd`）を
`insertTargetCwd` として渡す。`filesRowActions` は `terminal.cwd !== cwd` のとき
**relative の項目を出さない**。absolute は常に安全。

このズレは推論ではなく `gridInsertPath.spec.ts` の
「reports the two directories separately once a declined re-root pulls them apart」で
実挙動として固定してある（flush を false にすると `cwd` は `/work/a`、
`insertTargetCwd` は `/work/b` になる）。

## 構成

| ファイル | 役割 |
|---|---|
| `src/components/filesRowActions.ts`（新規） | 「この行に何を出せるか」を決める純関数。挿入テキストの組み立てまで持つ |
| `src/components/FilesPane.vue` | 右クリック / `Shift+F10` でメニューを開く。`insertTarget` / `insertTargetCwd` prop、`insert-text` emit |
| `src/components/TerminalGrid.vue` | `insertIntoExpandedCell` で `conn.insertText(\`cell-<expandedUid>\`, text)` |

引用符と末尾スペースは `dropPaths.ts` の `toShellArg` / `toInsertText` を再利用（D&D や
`pick-file` と同じ規則）。絶対パス化は `canvasOpenFile.ts` の `absoluteUnder`。

メニューは Teleport + fixed。`CockpitRowMenu.vue` と同じ理由で —— ツリーは overflow する
コンテナの中でスクロールするので、その場に置いたパネルは切られる。この repo で `@contextmenu`
を使う最初の箇所になるので、開閉・Escape・スクロールでの消滅・フォーカス復帰は
`CockpitRowMenu.vue` と `TerminalCell.vue` の作法に合わせた。

**アクションが 0 件のときは `preventDefault()` しない。** 全画面 Files は毎行それに当たる。
出すものが無いのにブラウザ自身のメニューを奪うのは、ただの損失。

**フォーカスを返すのは Escape と項目クリックのときだけ。** 外側クリックは
「フォーカスはここだ」とユーザーが既に言っているので、奪い返さない。副産物として、
別の行を右クリックして開き直すときに前の行へフォーカスが飛ぶ問題も起きない。

## 入れなかったもの

**テキストファイルの全文挿入。** メニューを「アクションの配列」にしてあるので項目追加で届くが、
サイズ上限と確認が別途要る（数 MB を bracketed paste でターミナルに流すと固まる）。
それ自体が別の設計判断なので、この PR には入れない。
