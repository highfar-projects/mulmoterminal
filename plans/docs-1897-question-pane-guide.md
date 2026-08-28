# docs: `questionPaneEnabled` を設定ガイドに書く (#1897)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 現在のコードの仕様はコードが唯一の情報源。数値は sha に紐づけて書くこと。

## 症状

`questionPaneEnabled` が `docs/guide/{en,ja}/config.md` に **1 行も無い**。本文の節も、末尾の
全キー表の行もない。出てくるのは 4.8.3 のリリースページと ChangeLog だけで、そこはガイド自身が
「スナップショットであり更新されない」と明記している。

一方で **UI にチェックボックスがあり、`mulmoterminal-keys` skill が節を持ち、
`settings-coverage.spec.ts` がこの設定をその skill に割り当てている。**

## skill を写さず、コードで確かめてから書いた

#1892 で「文書どうしが誤りを伝播させる」形を何度も踏んだので、主張は skill ではなくコードで確認した。

| 主張 | 根拠 |
|---|---|
| ペインから答えると、実ダイアログに矢印キーと Enter を押す | `app-config.ts:146-149` |
| ターミナルのダイアログは消えず、ペインは置き換えではない | 同上 |
| スマホはこの設定に関係なく同じ質問に答えられる | `app-config.ts:151-153`（mulmoserver#182） |
| OFF ならサーバは何も publish せず、質問がブラウザに届かない | `questionPane.ts:6-8` + `app-routes.ts:124` |

### ガイドに書く価値のあった差

`copyOnSelect` は手編集に**サーバ再起動＋タブのリロード**が要る。`questionPaneEnabled` は
**質問ごとにディスクから読む**ので、**再起動もリロードも不要**で次の質問から効く
（`config-routes.ts:199-204` にその理由が書いてある）。

隣の節と挙動が違うので、隣を読んだ人が誤解する。節に明記した。

## やったこと

- `docs/guide/{en,ja}/config.md` に `{#question-pane}` の節（`copy-on-select` と `keymap` の間）
- 末尾の全キー表に 1 行ずつ
- **#1892 でアンカーが無くてリンクにできなかった 4 箇所**（skill 対応表と Terminal keys の行、
  両言語）をリンクに差し替え

## レビュー指摘（codex、#1905）

> qualify the automatic-opening statement to the currently enlarged cell. A question arriving while
> its cell is tiled is stored and the pane opens only when that cell is enlarged.

**日本語だけが「ペインは自動で開き」と無条件に書いていた**（英語は "on the enlarged cell" と
限定していた）。コードで確認したところ指摘どおりで、`TerminalGrid.vue` がその設計を明示している:

> A question that arrived while its cell was **tiled** — or on another page of the grid — still has
> a session blocked on it, so **enlarging that cell is when to show it**.

`revealQuestion` は `expandedSessionId.value === sessionId` のときだけペインを出す。

**英語側も直した。** 「拡大したセルで開く」とは書いていたが、**タイル表示中に来た質問がどうなるか**
を書いていなかった —— 読者が一番知りたいのはそこ（失われるのか、どうすれば出るのか）。両言語に
足したのは 2 つ:

- タイル表示中に来た質問は失われず、**そのセルを拡大した時点で**開く。ペインを開くのはこの 2 つ
  だけで、専用ボタンは無い（`TerminalGrid.vue` にその理由も書いてある）
- **Esc で閉じたことはそのダイアログについて記憶される**ので、セルに戻っても開き直さない。
  次の質問は通常どおり開く

## 検証

- 節がリンクするアンカー（`copy-on-select` / `keymap` / `question-pane` / `terminal-submit`）が
  両言語に存在すること
- `questionPaneEnabled` の言及でリンクになっていないものが残っていないこと
- 主張 4 件をコードで確認（上表）
