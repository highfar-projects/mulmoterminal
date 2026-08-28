# feat: キー列送信を「知っている人しか辿り着けない」状態から出す (#1858)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 現在のコードの仕様はコードが唯一の情報源。数値は sha に紐づけて書くこと。

## 症状（報告者の言葉、#1858）

macOS で `Cmd+←` / `Cmd+→` / `Cmd+Delete` が効かない。正確には **Cmd だけが落ちて、修飾なしの
矢印・Delete と同じ動きをする**。1 文字だけ動くので、キーが効いていないのか押し方が悪いのか
機能が無いのかの区別がつかない。

設定画面のキーボードショートカット節を開いたが、**ターミナルへキー列を送る仕組みについての表示が
何も無かった**ので、リポジトリを clone して Claude Code に読ませ、`keymap.send` に辿り着いた。

> 「私自身、たどり着いたのは設定ガイドをエージェントと一緒に読んだからで、アプリの中を見ていて
> 見つけたわけではありません。」

## 何が本当の欠陥か

**`keymap.send` は画面と skill の両方で「既に知っている人」しか辿り着けない。** 同じ欠陥が
鏡写しになっていた。

| | アクション（9 つ、後に 10） | `send` |
|---|---|---|
| **画面** | 未設定でも「未設定」の行が出る | **0 件だと行が 1 つも出ない** |
| **skill** | スターターセット 4 つ、「発明するな、これを提案しろ」 | **提案の指示が無い。bytes 早見表だけ** |

`src/components/keymapLabels.ts` のコメントが、これを事実として書いてしまっていた:

> unlike an action, one exists only because the user wrote it, so an unbound row cannot be shown
> and **there is nothing to show at all until they add one**

**行については正しいが、機能については誤り。** 見せるものが無いのは「エントリ」であって、
「そういう仕組みがある」は 0 件でも見せられる。

### 報告者の版（4.10.1）で確認済み —— 部品は揃っていた

`git cat-file -p 4.10.1:src/components/settings/KeyboardShortcutsSection.vue` で確認:

- `sendKeyRows`（`send` を 1 件ずつ描画）は**既にあった**
- `mulmoterminal-keys` を起動する `SkillLaunchButton` も**既にあった**

**それでも clone された。**理由は上の空状態と、もう 1 つ:

**intro の文章が、真下のボタンではなく設定ファイルを指していた。**

> 「読み取り専用です。ショートカットは `~/.mulmoterminal/config.json` の `keymap` に割り当てる
> まで無効です。…**ガイド**も参照してください。」

名指ししているのは**設定ファイル**と**ガイド**の 2 つだけ。すぐ下のボタンには一言も触れていない。
CLAUDE.md には既にこのルールがある:

> A skill with a Settings section is launched from it, not just named in prose. … say in the
> section's own copy **what the skill does that the controls above it can't** — a button that
> looks like a slower way to do what the UI already does is not pressed.

## 方針 —— 画面は view のまま

**一度「keymap 全体を設定 UI で編集可能にする」案を検討し、取り下げた**（#1888 に記録）。

取り下げた理由: editor の根拠として挙げた「壊れたバインドでサーバ起動不能」「macOS の
`Option`+英字が一致しない」の 2 つは、**どちらも手で JSON を書く人の罠**で、skill に書かせれば
skill が検証するのでもともと踏まない。README:634 の記録済みの判断（`keymap` は skill が持つ）を
覆すには弱い。

**そして #1858 が訴えているのは編集の手間ではなく、発見できないこと。**

- **画面**: 存在を見せ、ボタンを押す理由を与える（read-only のまま）
- **skill**: 押されたら、ユーザーが何も知らなくても**提案から始まる**

## 実装

### ① 画面 —— `KeyboardShortcutsSection.vue` + i18n

- `sendKeyRows.length === 0` のとき、**アクションと同じ行の文法**でプレースホルダを 1 行出す
  （ラベル / 「未設定」 / `send` タグ）。`data-testid="send-none"`
- intro を書き換え。**割り当てられるものが 2 種類あることを最初に言う**（MulmoTerminal の操作 /
  ターミナルへのキー列送信、macOS の `Cmd+←` を例に）。指す先を設定ファイルから**下のボタン**へ。
  `configFile` スロットは文面から消えたので template からも削除
- `keymapLabels.ts` の誤解を招くコメントを訂正（行の話と機能の話を分ける）

**「読み取り専用です」は残す。** 画面が書けないことは変わらない。

### ② skill —— `server/skills/mulmoterminal-keys/SKILL.md`

- **`## Open with a proposal, not a question`** を先頭に追加。ほとんどの人は「何を割り当てたいか」
  を決めずにボタンを押すので、それを聞き返すのは**答えを求めて来た質問を突き返す**ことになる。
  代わりに ①現在の config を読む ②`uname` でプラットフォームを見る ③アクション側と `send` 側から
  1 セットずつ具体的に提案する ④選ばれたものだけ書く
- **macOS では `send` の行編集セットから入る**と明記。#1858 の「半分効いているように見えるので
  沈黙より診断しにくい」を理由として書いた
- **`send` にもスターターセットを追加。** アクション側にはあって `send` に無かったのが欠陥の片側

#### スターターセットは 1 つだけにした（自分で書いて自分で削った）

最初 3 つ書いたが、2 つは**悪い助言**だったので消し、消した理由を skill 本文に残した:

- **`Alt+←` / `Alt+→` の単語移動** —— macOS では**既に効いている**（報告者自身が
  「Option+矢印は単語単位できちんと動きます」と書いている）。send で縛ると、動いている挙動を
  固定の `\u001bb` / `\u001bf` に置き換えることになる
- **`Cmd+k` の kill-to-end** —— **ブラウザが `Cmd`/`Ctrl`+`K` をアドレスバーに取る**ので黙って
  効かない。skill 自身が `W`/`T`/`N` について書いている罠と同じ。しかも `Ctrl+K` は元から
  打てるので、送る必要が無い

残ったのは **macOS 行編集セット**（`Cmd+ArrowLeft` → `\u0001`、`Cmd+ArrowRight` → `\u0005`、`Cmd+Backspace` → `\u0015`）
の 1 つだけ。**これが unprompted に提案して安全な理由**も書いた: その 3 つは今まさに Cmd が落ちて
素の矢印 / Delete としてターミナルに届いているので、**奪うものが無い**。

- frontmatter の起動条件に、報告者の言葉に近い症状を追加（Mac で Cmd+矢印 / Cmd+Delete が
  修飾なしと同じ動きをする）

### ③ ドキュメント

- `docs/guide/{en,ja}/config.md` の `#keymap-send` 節 —— 0 件でも行が出ることを追記
- `README.md` の zoom の項 —— 設定ファイルの前に **Settings のボタン**経路を書き、
  `#keymap-send` へリンク（アンカーの存在は両言語で確認済み）

## やらないこと

- **#1858 の案 1（macOS で `Cmd+←`/`→`/`Delete` を既定にする）は含めない。** 既定値の変更は
  設定画面とは別物で、単独で revert できるべき。ユーザー判断で見送り
- **keymap の編集 UI**（#1888、取り下げ済み）
- アクションのラベルは `keymapLabels.ts` にハードコードの英語（i18n キーではない）。翻訳は別件

## 検証

### break-verify（各回のあと `diff -q` で byte-identical 復元を確認）

| ミューテーション | 結果 |
|---|---|
| 空状態の行を削除（= #1858 そのもの） | **3 red** |
| intro を元の文面（設定ファイルを指すもの）に戻す | 1 red |
| `sendNone` の **ja だけ**を消す（半分だけ翻訳された状態） | 1 red |

### テスト

`test/src/components/settings/keyboardShortcutsSection.spec.ts`（7 件）。**空状態を対象にしている**
—— 全ユーザーが最初に居る状態がそれで、そこが #1858 の現場だから。

1 件は日本語ロケール。**キーが片方のロケールに無いと、vue-i18n はキーパスをそのまま描画して何も
投げない** —— この変更が扱っている沈黙と同じものが 1 層下にある。リポジトリに ja/en のキー対応を
見るテストは無かった。

制御文字は `CTRL_A` / `CTRL_E` の定数にした（`test/common/keymapSend.spec.ts` と
`test/src/components/keymapLabels.spec.ts` の既存の書き方に合わせた）。最初 raw な C0 バイトを
ソースに直接書いてしまい、**diff でも grep でも見えない**状態になっていた。

### 実機（`--port 34912`、scratch な `HOME`。実サーバ 34567 には触れていない）

コンポーネントを mount しただけではアプリではないので、**ビルドしてブラウザに実際に配られる
バンドルの中身**を確認した:

| | 期待 | 実測 |
|---|---|---|
| `Send keys to the terminal` | 1 以上 | 1 |
| `ターミナルにキー列を送る` | 1 以上 | 1 |
| 新しい intro（en / ja） | 1 以上 | 1 / 1 |
| 旧 intro `Shortcuts are off until you bind them` | 0 | 0 |
| 旧 intro の `ショートカットは {configFile}` | 0 | 0 |

### `origin/main` を取り込んで壊れた（そして直した）

レビュー中に #1890（launch panel、#1867）が main に入り、**`KEYMAP_ACTIONS` に 10 個目
`terminal-new-here` が増えた**。マージした結果、行数を数える 2 件が赤くなった:

```text
expected [ … ] to have a length of 10 but got 11
expected [ … ] to have a length of 11 but got 12
```

**壊れたのは私のテストの書き方**で、`9 + 1` / `9 + 2` と**数を書いていた**。`send` の行についての
spec が、send と何の関係も無い理由で落ちたことになる。`KEYMAP_ACTIONS.length + n` に**導出**する
形へ変更した —— pin したいのは「プレースホルダは**追加**であって置き換えではない」であって、
アクションが何個あるかではない。

コメントと plan の「9 つのアクション」も、同じ理由で数を言わない書き方に直した。

### スクリーンショットを撮って初めて見えたこと

CodeRabbit が「ユーザーが見るものにはスクリーンショットを」と指摘したので、scratch な `HOME` の
サーバ（`--port 34913`）に puppeteer を当てて両ロケールで撮った。**そこで 2 つ分かった:**

1. **1 回目の 2 枚が byte-identical だった。** ページ内で `select` を触って言語を切り替えたつもりが
   別のコントロールで、**日本語の画面を 2 枚撮って片方に `-en` と名前を付けていた**。`--lang` も
   headless では `navigator.language` を動かさない。アプリ自身の保存キー（`ui_language`）を
   `evaluateOnNewDocument` で入れる形にして解決
2. **日本語表示では、アクションのラベル 10 個だけが英語のまま**だった（`keymapLabels.ts` の
   `LABELS` がハードコードの英語で、i18n を通っていない）。この PR が足す `send` の行は i18n を
   通っているので、**11 行のうち 1 行だけが日本語**という並びになる

2 は隠さずスクリーンショットに写っているものをそのまま出し、[#1894](https://github.com/receptron/mulmoterminal/issues/1894)
として分けた。**この PR に含めない理由**は「単独で revert できるものは別 PR」というルール —— ラベルの
i18n 化はこの変更と独立に戻せる。ja のガイドには注記とリンクを置いた。

画像は 2x で撮って 950px へ縮小（`docs/guide/images/config-keymap-send-empty-{en,ja}.png`、
259KB / 279KB。リポジトリの既存画像は 60KB〜840KB）。

### codex が見つけた、私の手順の内部矛盾

**`CODEX VERDICT: CHANGES REQUESTED`（2 巡目）:**

> The mandated initial `send` proposal remains unconditional although the only `send` starter set
> is macOS-only, leaving Linux/Windows flows internally contradictory.

正しい。手順 3 が「アクション側と `send` 側から 1 セットずつ提案しろ」と**無条件**に書いてあるのに、
`send` のスターターセットは macOS 専用の 1 つしかない。Linux / Windows では、**存在しないセットを
提案するか、指示に従わないか**の二択になる。

手順 3 をプラットフォーム条件付きに直し、**なぜ非 macOS のセットが無いのかを書いた** ——
`send` は「シェルが理解するキーを、キーボードにあるキーから届かせる」ためのもので、Linux / Windows
では `Ctrl+A` / `Ctrl+E` がそのまま打てるので**埋めるべき穴が無い**。これは欠落ではなく設計。

### CodeRabbit が見つけた、私が作った衝突（Major）

`send` の節に「macOS では `Alt+←`/`Alt+→` は既に単語移動として効いているので、send で縛るな」と
書いた。**ところが既存の Arrows アクションセットは、その 2 キーをアクションとして割り当てる。**

アクションはグリッドの capture フェーズのハンドラが `stopPropagation()` するので
（`common/keymap.ts` のコメント: *"the grid's handler runs in the capture phase and stops the
event before the terminal"*）、**Arrows を Mac で勧めると、2 つ下の節で守れと書いた単語移動を
その場で奪う**。

しかも私は Arrows の行に「the two do not collide — one binds app actions, the other sends bytes」と
**自分で書き足していた**。アクションと send は互いに衝突しないが、**アクションとターミナル自身の
挙動**は衝突する。書いた警告と、書き足した安全宣言が矛盾していた。

- Arrows は macOS では **Up/Down のペアだけ**を割り当てる、と行に明記
- 残す 2 つを `zoom-toggle` と `next-attention` に対応させる —— 「必ずこの 2 つのどちらかを
  割り当てろ」という既存ルールが要求しているものと一致する
- 「衝突しない」の主張を「macOS 提案の 2 つの半分は**別のキーを取る**」に置き換えた

### ゲート

`format` / `lint` / `typecheck` / `build` / `test` すべて exit 0。
`yarn test` は `d52fb64a` で **11522 passed**（+7、この PR が足したもの）。main（#1890）を取り込んだ後は **11590**。
