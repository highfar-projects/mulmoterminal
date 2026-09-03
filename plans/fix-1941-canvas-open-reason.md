# fix(#1941): Canvas で開けなかった理由を出す

## いま何が黙っているか

`TerminalGrid.openFileInCanvas` は `buildCanvasCard` が `null` を返したら黙って戻る。そのコメントは
「stale click しか起きない」と言っているが、それは **#1374 の頃の話**で、Canvas ボタンが「開いている
ファイル」にしか出なかった時代の前提。#1933 でワークスペース以下のデッキが対象になり、**サーバが
文章つきで拒否する経路**が増えた（未登録 root / ワークスペースが動いた / 読めない）。

サーバは答えているのに、ユーザーには届かない。

## 決定

### D1: 返りを 3 値にする（`null` に潰さない）

いまは「対象外」「サーバが拒否」「ネットワーク失敗」がすべて `null` で、**呼び出し側が理由を知る
手段がない**。判別可能な形にする:

```ts
type CanvasCardResult =
  | { kind: "card"; card: CanvasCard }
  | { kind: "refused"; reason: string }   // サーバが理由を返した
  | { kind: "none" };                     // どのプラグインも描けない
```

`none` は**黙ったままでよい**。メニューにもボタンにも出ないので、押されること自体が無い。

### D2: 文言はサーバのものをそのまま出す

言い換えると、原因の説明が 2 か所（サーバとクライアント）に分かれる。サーバ側の文言は
`server/backends/mulmoscript.ts` の `wirePathMismatch` とプラグインの `bad_request` で、どちらも
既に「何が起きて、どうすればいいか」の文になっている。

### D3: 出す場所は Files ペイン

クリックした場所であり、既に `fileError`（`FilesPane.vue:677`）という表示を持っている。ターミナル側の
`showHint` にも出せるが、視線がクリックした場所から動く。

ペインは `defineExpose` を持っているので、`showError(message)` を足して `TerminalGrid` が呼ぶ
（`filesPane.value?.flush()` と同じ経路）。

## 変更

| 変更 | 場所 |
|---|---|
| 返りを 3 値に、`reopenStory` がサーバの `error` を読む | `src/composables/canvasOpenFile.ts` |
| 拒否のときだけペインに渡す | `src/components/TerminalGrid.vue` |
| `showError` を公開して `fileError` に出す | `src/components/FilesPane.vue` |

## 実機検証（2026-09-02）

隔離サーバ（scratch HOME・ポート 34729・tmux ソケット `mt-verify1941`）で、**別のディレクトリで
起動し直した状態**を作った（`/api/config` の `storiesRoot.id` だけを差し替え、パスはそのまま）。
これは「カードは残っているが、この起動ではその root を登録していない」状況そのもの。

| 見たこと | 修正前 | 修正後 |
|---|---|---|
| 右クリック → Open in the Canvas | 項目は出る、押しても**何も起きない** | 項目は出る、押すと**ペインに理由が出る** |
| 文言 | —— | `unknown stories root "0000deadbeef0000"` |
| console | `[canvasOpenFile] reopen HTTP 400` だけ（開発者しか見ない） | 同じログ + **画面に文言** |

## 途中で直したこと（実機で気づいた）

最初の実行では文言が `Unknown stories root`（id 無し）でした。`wirePathMismatch` が
**resolve 失敗まで横取りして** ops の素っ気ないテキストを返していたためです。resolve できない
パスは dispatch の担当（`unknown stories root "<id>"` と id を名指しする）なので、そこは通し、
この関数は**解決したのに別ファイルを指す**という、それだけが見える case に絞りました。

## 残す判断

未登録 root の文言はプラグインのものをそのまま出しています（D2）。`unknown stories root "<id>"` は
技術的ですが、**言い換えると原因の説明が 2 か所に分かれます**。「別のディレクトリで起動し直した」
という言い方が要るなら、プラグイン側の文言を直す方が筋です。
