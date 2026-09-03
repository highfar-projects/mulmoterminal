# feat(#1933): ワークスペース以下のデッキを Canvas で開いて編集する（#3014 順序 2）

## 何を足すか

`@mulmoclaude/mulmoscript-plugin@4.5.0` の名前付き root を、MulmoTerminal 側で **1 個だけ**登録する。
これで `<workspace>` 配下のどこに置いたデッキでも Canvas で開き、編集し、生成できる。

## 決定

### D1: 登録する root は「ワークスペース 1 個」

ランチャーは `CLAUDE_CWD` に**ユーザーが起動したディレクトリ**を入れて渡す（`bin/cli-args.js` の
`chooseCwd` —— `--cwd` 省略時は `"."` ＝ 実行した場所）。root は**サブツリー**なので、これを 1 個
登録すれば配下の全リポジトリが覆える。#3014 の依頼文（「mulmoterminal で起動している path 以下が
見えるのが理想」）そのもの。

セルは任意のディレクトリで開けるが、**ワークスペースの外のデッキは対象外**。root を増やすほど
addressable な面が広がるので、境界は 1 本に保つ。

### D2: root id は正規化パスの安定ハッシュ。ラベルは使わない

id はホストの持ち物で、**カードに永続化される**（プラグインは不透明なキーとして引くだけ）。
`launch` のようなラベルにすると、別ディレクトリで起動した瞬間に**同じ id が別のサブツリーを指し**、
保存済みカードが黙って別ファイルを開く。ハッシュなら id 自体が変わり、古いカードは「未登録 root」
として `bad_request` で落ちる —— #3015 が fallback ではなく拒否にしたので、安全側に倒れる。

### D3: 既定 root を優先する（同じファイルを 2 通りで名指ししない）

named root は `<workspace>`、既定 root は `<workspace>/artifacts/stories`。後者は前者の**配下**なので、
同じファイルが `{root: 無し, "stories/x.json"}` と `{root: id, "stories/artifacts/stories/x.json"}` の
2 通りで名指しできてしまう。識別子が違うので**カードが 2 枚**になる。`storyWirePath` は既定 root を
先に判定し、そこに当たったら named root を見ない。

### D4: クライアントへ id を渡す口は `/api/config`

`worktreesRoot` と同じ種類の値 —— 「このサーバの実行時の事実で、ブラウザには算出できない」。
既存のレスポンスに 1 フィールド足す。

### D5: クライアント側は `workspace` 単体ではなく組で持つ

`storyWirePath` / `canOpenInCanvas` / `buildCanvasCard` / `filesRowActions` はいま `workspace: string | null`
を受けている。id も要るので、2 本目の prop を並べず `{ workspace, rootId }` の組に変える。片方だけ
渡された状態を型で作れなくする。

### D6: `filePathIdentity` は対で畳む（#3014 衝突点 3）

プラグインは結果に `root` を載せるようになった。畳む鍵を `filePath` 単体のままにすると、
**2 つの root の同名デッキが同じカードに合流する**。`presentHtml` も同じ関数を使っているが、
そちらに `root` は無いので `undefined` として畳まれ、挙動は変わらない。

## 変更

| 変更 | 場所 |
|---|---|
| root id の導出（純関数） | `server/backends/storiesRoot.ts`（新規） |
| root 登録 / `artifactsFor` / `rootScopedGenerationState` | `server/backends/mulmoscript.ts` |
| `/api/config` に `storiesRootId` | `server/config/config-routes.ts` |
| `storyWirePath` が named root を返す、`reopenStory` が root を送る | `src/composables/canvasOpenFile.ts` |
| `filePathIdentity` が root を見る | `src/utils/canvasIdentity.ts` |
| 組を受け取る（prop の付け替え） | `FilesPane.vue` / `filesRowActions.ts` / `TerminalGrid.vue` / `useAppConfig.ts` |

## 実機検証（2026-09-01）

隔離サーバ（scratch HOME・ポート 34725・tmux ソケット `mt-verify1933`）に、ワークスペース配下の
リポジトリとしてこれを置いた:

```
<ws>/myrepo/decks/talk.json   ← デッキ
<ws>/myrepo/notes.md          ← --- 区切りのメモ
```

| 見たこと | 結果 |
|---|---|
| `/api/config` | `storiesRootId: 73537714d0bfe6dd` |
| 読み（`kind:"save"` + root） | `ok:true`、スキーマ補完済みの script が返る |
| 未登録 root | `bad_request: unknown stories root "deadbeef"` |
| **書き（`updateScript` + root）** | `{"ok":true,"root":"73537714d0bfe6dd"}`。**`myrepo/decks/talk.json` の中身が変わり、`<ws>/stories/` は生えない** |
| ブラウザ: ツリーで右クリック | `Open in the Canvas` が出る（#1924 のメニューは無変更） |
| クリック後 | **Canvas にデッキが出る**。Edit / Media タブ、Movie / PDF、beat ごとの Generate —— 読むだけでなく編集・生成が使える |
| console error | 無し |

書きが読みと同じファイルに落ちることを**実ファイルで**確認した。#3020 の H1 がまさにここだった。

## 統合して初めて出た問題 2 つ

**1. レスポンスの形が経路で違う。** カード生成は `body.data` を読んでいたが、それは**エージェントの
ツール呼び出し（`kind` 無し）**の封筒。dispatch は `{ok, script, filePath, root}` と**平たく**返す。
`kind:"save"` に切り替えた結果カードが組めなくなり、**メニューには出るのにクリックしても何も起きない**
状態になっていた。ユニットでは気づけず、ブラウザで押して初めて出た。回帰テストを追加。

なお `kind` 無しの経路を root 対応にはしない。そこはエージェントのツール呼び出しが通る道で、
`root` を tool schema に入れないことが封じ込めの境界だから（receptron/mulmoclaude#3015）。

**2. `@mulmoclaude/core` も上げる必要があった。** `mulmoscript-plugin@4.5.0` は core `^4.5.0` を宣言
していて、`test/scripts/mulmoclaudePeerRanges.spec.ts` が「宣言と実際に走る版が食い違う」と赤にした。
プラグインだけ上げると型は通り、ビルドも通り、実行時に壊れる類の食い違いなので、このテストが
仕事をしている。

## ゲート

`yarn format` / `lint` / `typecheck` / `build` すべて 0。`yarn test` は **11821 passed / 50 skipped**。
追加したテストは、判定を戻す mutation（named root の分岐を落とす / 同一性から root を外す）で
**3 件が赤**になることを確認済み。
