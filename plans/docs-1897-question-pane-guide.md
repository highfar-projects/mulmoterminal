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

### 2 巡目 —— 列挙にもう 1 つ足すのではなく、規則で書き直した

codex（2 度目）: 「開くのはこの 2 つだけ」は誤りで、**3 つ目がある** ——
`onPubSubReconnect` → `revealQuestion` が、リロードや接続断からの復帰でも開く。
**そのコードは自分で読んでいたのに、絶対の列挙を書いた。**

#1904 で出たばかりの結論がそのまま当てはまる:

> Adding the word to the list would have been the same mistake a third time — **the list is what
> failed, twice.**

なので列挙をやめ、**規則**にした:

> 規則は「質問が来たら開く」ではなく、**「拡大しているセルは、そのセッションが止まっている質問を
> 出す」**

これは `revealQuestion` の 3 つの呼び出し元（質問の到着 / 拡大セルの変化 / pubsub 再接続）を
すべて含み、しかもどれも `expandedSessionId` で守られているという実装そのものの形。
「ページを再読み込みしても質問を失わない」という**読者にとっての意味**も同時に言える。

### 3 巡目 —— 「何も publish しない」も絶対の言い方だった

codex（3 度目）: 「OFF なら何も publish しない」は誤り。`shouldPublishQuestion` は

```ts
isAskQuestionDone(event) || paneEnabled
```

つまり**止まるのは「質問の提示」だけで、「閉じた」の通知は OFF でも流れる**。理由もコードに
書いてあった:

> Turning the switch off mid-dialog would otherwise **strand a pane that is already showing
> buttons**: the dialog closes, nothing says so, and the next click sends Down/Enter into the
> prompt underneath.

**私の絶対の言い方が、この巡だけで 2 回目**（「開くのはこの 2 つだけ」に続いて）。どちらも
「全部/何も」と書いて、例外が 1 つあった。**何が gate されているかを書く**形に直した ——
gate されているのは提示であって、チャネル全体ではない。

閉じた通知が**質問文を含まない**ことも書いた（`askQuestion.ts:77`）。OFF のままの人が
「切っているのに何か流れているのか」と思わずに済む。

### 4 巡目 —— 「Esc で記憶される」は帰属の誤り

codex（4 度目）: 記憶されるのは **ペインの × ボタン**（`question-close-btn` → `emit('close')` →
`dismissQuestionPane` → `questionBox.dismiss`）で、**Esc ではない**。ペインに Esc の処理は無く、
Esc は**ターミナル側でダイアログを取り消す**もの —— その場合は質問自体が終わるので、
記憶する対象が無い。

消え方が 2 通りあることを書き分けた:

| 消え方 | 記憶されるか |
|---|---|
| 質問が終わった（ターミナルで答えた / ペインで答えた / Esc で取り消した） | されない（答えるものが無い） |
| **ペインの × で閉じた** | **される**（「ターミナルで答える」という意思表示） |

**この PR で私の誤りを訂正していただくのは 4 回目**。内訳は「絶対の言い方」2 回
（"the only other thing that opens it" / "publishes nothing at all"）、限定の欠落 1 回
（日本語だけ「自動で開く」）、そして今回の帰属の誤り。**どれも読者が実際に取る行動
（リロードする / スイッチを切る / × を押す）についての記述だった**のが共通点。

## 検証

- 節がリンクするアンカー（`copy-on-select` / `keymap` / `question-pane` / `terminal-submit`）が
  両言語に存在すること
- `questionPaneEnabled` の言及でリンクになっていないものが残っていないこと
- 主張 4 件をコードで確認（上表）
