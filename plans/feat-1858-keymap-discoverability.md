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

### 同じ主張が 6 箇所にあり、1 箇所ずつ直していた

CodeRabbit が skill の frontmatter の「only lists what is bound」を指摘し、私はそこだけ直した。
**次の巡で codex が、画面そのものの文言に同じ誤りが残っていると指摘した** —— 説明を直して、
説明されている当のものを直していなかった。

そこで grep して全部掃いた。同じ主張は **6 箇所**にあった —— うち 1 つ（skill）は 1 巡目で直しており、
この巡で新たに掃いたのは残る 5 箇所:

| 場所 | 直す前 |
|---|---|
| `src/i18n/en.ts` | "this lists what is bound under `keymap` now" |
| `src/i18n/ja.ts` | 「いま `keymap` に割り当てられているものが出ます」 |
| `docs/guide/en/config.md` の一覧表 | "What is bound to what, read-only" |
| `docs/guide/ja/config.md` の一覧表 | 「今どのキーに何が割り当たっているかの一覧」 |
| `README.md` | "that section also lists what is bound now" |
| `server/skills/…/SKILL.md`（1 巡目で修正済み） | "only lists what is bound" |

**どれも元から誤り**だった —— この節は未設定のアクションも全部並べている。1 箇所ずつ直すのを
やめて、`grep` で 0 件になるまで掃いた。

### `uname` はサーバのホストで、キーボードはブラウザ側（CodeRabbit、diff 外）

手順 2 に「`uname` でプラットフォームを見る」と書いたが、**`uname` が答えるのはサーバが動いている
マシン**で、キーが押されるのは**ブラウザ**。Mac から Linux ホストに繋いでいる人には Cmd キーが
あるし、逆もある。アプリに client platform を知る手段は無い（`navigator.platform` 系は
`src/` に 1 箇所も無い）。

**黙って分岐しない**形に直した —— `uname` は同一マシン構成では当たる推測なので、推測として使い、
**置いた仮定を口に出す**（「Mac ですね、では…」）。違う人は一言で訂正できる。毎回聞けば全員が
往復のコストを払うが、外れた推測のコストは一文で、外れた人にしかかからない。

### ローカル codex が見つけた、3 度目の「1 箇所だけ直した」

CodeRabbit の Major（Arrows が macOS で単語移動を奪う）を **SKILL.md では直したが、ガイドは
直していなかった。** ガイドは Mac ユーザーに矢印キー版を勧め、しかも「どの環境でも同じように
動きます」と書いていた。

これで**同じ形の見落としが 3 回目**:

| 巡 | 直した場所 | 残した場所 |
|---|---|---|
| 1 → 2 | skill frontmatter の「only lists what is bound」 | 画面そのものの文言（codex が指摘） |
| 2 → 3 | 画面の文言 | ガイド 2 つ + README（grep で全 6 箇所と判明、残る 5 箇所を一括修正） |
| 4 → 8 | SKILL の Arrows 警告 | `docs/guide/{en,ja}/config.md` の Arrows 節（ローカル codex が指摘） |

**教訓は毎回同じで、対策も毎回同じ**: 指摘を受けたら、その 1 箇所を直す前に `grep` で同じ主張の
全箇所を出す。今回も「どの環境でも同じように動きます」で grep して 0 件になるまで掃いた。

両ガイドの矢印キー節に警告ブロックを足した —— macOS では上下のペアだけ、理由（capture フェーズが
ターミナルより先にキーを奪う）と、そのペアで足りる理由（拡大していなくても使えるのは `zoom-toggle`
と `next-attention` の 2 つ）付き。

### スクリーンショットが古かった（ローカル codex、grep には映らない）

> grep misses it because it is embedded in PNGs.

**画像は撮った時点の UI を写す。** 撮影は `19a89031`（18:44 JST）、intro を掃いたのは `5fbb2578`
（19:49 JST）。つまり committed の PNG 2 枚は、**その 1 時間後に消した文言**（"this lists what is
bound under `keymap` now" / 「いま `keymap` に割り当てられているものが出ます」）を写したままで、
すぐ隣のガイド本文と矛盾していた。

**掃いたつもりの grep が 0 件を返したのは、文字が PNG の中にあるから。** ビルドしたバンドルを
grep して新しい文字列を確認したのに、画像は確認していなかった。

両方を現在のビルドから撮り直した（en は "Read-only, and everything is listed whether it is bound
or not"、ja は「読み取り専用で、割り当ての有無にかかわらず全部…」を写している）。

**残る危険として記録しておく**: ドキュメントのスクリーンショットは UI の文言を焼き込むので、
**その文言を変えたら撮り直しが要る**。テストでは検出できない —— PNG を読めるものがリポジトリに
無い。この PR では 1 巡かけて偶然見つかったが、次は見つからないかもしれない。

### false positive を 1 件、証拠つきで却下した

codex CI（round 12）が `CHANGES REQUESTED`:

> The newly required macOS `send` starter path uses caret-display strings (`^A` / `^E`)

**SKILL.md にキャレット文字列は 1 つも無い**（`grep '\^A|\^E|\^U|\^K'` が 0 件）。スターター
セットも JSON 例も `\u0001` / `\u0005` / `\u0015` を書いている。リポジトリ全体でも
`"bytes": "^` は 0 件。

キャレット記法は**表示側**のもので、`describeBytes` が `\u0005` を `^E` に変換して設定画面に出す。
ガイドの 2 箇所はその表示を説明しているだけ（*"without decoding `\uXXXX`"* と書いてある）。

**変更せず、証拠を PR に置いて再確認を求めた。** codex は次の巡で LGTM に転じ、
*"the skill examples use JSON Unicode escapes for the raw control bytes"* と明記した。
直していたら、動いている制御バイトを literal な `^E` に壊していた。

### 設定を「読む」だけでは足りない（CodeRabbit）

手順 1 は「今の config を読んで報告しろ」だったが、**読んだ内容を、これから提案するものと
突き合わせろ**とは書いていなかった。既に `Cmd+ArrowLeft` にアクションが割り当たっていると、
提案した `send` は**アクションに負けて黙って発火しない** —— ユーザーが承諾したのに一度も
動かない変更になる。

手順 1 に衝突チェックを追加し、スターターセットの「costs nothing」にも条件を付けた。

**そして次の巡で、2 人のレビュアーが独立に同じ穴を指摘した** —— 私が足したチェックは**アクション
だけ**を見ていて、**既存の `send`** を見ていなかった。`sendBytesFor` は先勝ちなので
（`common/keymap.ts`: *"First match wins, so a keystroke listed twice uses the earlier entry."*）、
既存 `send` の後ろに足すと**新しい方が永久に発火しない**。しかも検証は duplicate を warn する
だけで止めない。

黙って失敗する経路が 2 つあるので、表にした:

| キーストロークに既にあるもの | 何が起きるか | どうするか |
|---|---|---|
| **アクション** | アクションが勝つ（capture フェーズで奪う） | 言って、アクションを移すか聞く |
| 既存の **`send`** | **先に書かれた方**が勝つ | そのエントリを更新する。2 つ目を足さない |

### 一番実害のあった指摘 —— 「partial merge」はキー単位で、`keymap` は全置換（codex CI）

skill の冒頭はこう書いていた:

> each write is a **partial `POST /api/config` merge** — write only the key you are changing, so
> the user's other settings survive.

トップレベルについては正しい。**`keymap` の中身については誤り。** `server/config/app-config.ts`:

```ts
const updated = <T>(key: keyof AppConfig, sanitize: (input: unknown) => T, current: T): T =>
  body[key] !== undefined ? sanitize(body[key]) : current;
```

`{ "keymap": { "send": [ … ] } }` を POST すると、**それが keymap の全体になり、アクションの
割り当てが全部消える。** 警告は出ず、レスポンスは成功。

skill に明記した —— keymap の書き込みは常に**完全な** keymap を送る（手順 1 で読んだもの＋変更）。
以下の例は読みやすさのために 1 設定だけ書いてあるが、**そのまま POST する body ではない**。

**他の skill を掃いた結果**（3 回同じ形の見落としをしたので、今度は先に掃いた）:

| skill | 同じ注意書き |
|---|---|
| `-theme` | あり（"The whole array vanished — a partial write. Always send `themes` complete."） |
| `-model` | あり（`providers` / `customAgents` とも "complete"） |
| `-keys` | **無かった → この PR で追加** |
| `-header` | **無い** → 別 skill なので [#1896](https://github.com/receptron/mulmoterminal/issues/1896) に分離 |

### 私が書いた誇張（ローカル codex、P3）—— そして記録した危険が即座に効いた

intro はこう約束していた:

> the agent checks a binding against **what is already running in your terminal** before writing it

**エージェントにそれを調べる手段は無い。** 照合できるのは既存の keymap（`actionForKey` /
`sendBytesFor` が知っているのは設定された claim だけ）と、プラットフォーム / ブラウザ固有の罠まで。
vim や claude が何を bind しているかは見えない。

「既にある割り当てと、ブラウザ / Mac 固有の落とし穴と突き合わせる」に直した。en / ja / README の
3 箇所。

**そして 4 箇所目がスクリーンショットだった。** 2 枚とも同じ文言を焼き込んでいたので撮り直し。
**1 巡前に「文言を変えたら撮り直しが要る」と書いた危険が、次の巡でそのまま発生した。** 記録して
おいて良かったし、テストで防げないことの証明にもなっている。

同じ巡で、skill 本文が設定画面を「every action and its current binding」と説明したままだった
（frontmatter は `send` 行も含むと直してあったのに）。同一ファイル内の不整合。

### 4 度目の「1 箇所残し」—— 今度は grep の掛け方が原因だった

誇張を en / ja / README / スクリーンショット / skill で直したあと、**spec のコメントが残っていた**
（*"the thing that can check a binding against what is running in the cell"*）。

**今度は grep の掛け方が悪かった。** 完全一致（`already running in your`）で掃いたので、言い回しの
違う箇所を拾えなかった。概念で掛け直したら 1 件出た:

```text
grep -rniE "running in (the|your) (cell|terminal)|already uses|what your agent" src/ test/ server/skills/ docs/ README.md
```

**教訓の更新**: 「指摘を受けたら grep で全箇所を出す」だけでは足りない。**同じ主張が別の言い方で
書かれている**ので、フレーズではなく**概念**で掛ける。この PR で 4 回踏んだ:

| 回 | 直した場所 | 残した場所 | なぜ残ったか |
|---|---|---|---|
| 1 | skill frontmatter | 画面の文言 | そもそも掃かなかった |
| 2 | 画面の文言 | ガイド 2 つ + README | 同上（この回から grep を始めた） |
| 3 | SKILL の Arrows 警告 | 両ガイドの Arrows 節 | 別ファイルまで見なかった |
| 4 | 誇張を 5 箇所 | spec のコメント | **完全一致で grep した** |

### 日本語の intro が退行してもテストが赤くならなかった（ローカル codex、P3）

en の intro は `toContain("button below")` と `not.toContain("~/.mulmoterminal/config.json")` で
pin していたが、**ja は placeholder の行しか見ていなかった**。つまり **ja の intro だけを元の
「設定ファイルを編集しろ」に戻しても全テストが緑**だった —— *半分だけ直したものが、直ったものとして
出荷される*形で、この PR が扱っているバグと同じ形。

ja にも同じ 2 つを pin した。break-verify: **ja の intro だけを戻すと 1 red**（復元は
byte-identical）。

### skill が持つ設定は 3 つではなく 4 つだった

frontmatter と冒頭が「`keymap` / `copyOnSelect` / `terminalSubmit` の 3 つ」と書いていたが、
同じ skill は `questionPaneEnabled` の節も持っており、**`test/server/config/settings-coverage.spec.ts`
がその設定をこの skill に割り当てている**（`questionPaneEnabled: { ui: true, skill: "mulmoterminal-keys" }`）。

frontmatter に加え、冒頭の「All three settings」は数を言わない形にした。

**そして次の巡で、その修正が半端だと指摘された（5 度目）。** frontmatter は 4 つ列挙したのに、
同じ文の末尾が「the other **two** have a checkbox and a picker」のままだった。codex が残りの
全箇所を名指ししてくれたので、まとめて掃いた:

| 場所 | 直す前 |
|---|---|
| `SKILL.md` frontmatter 末尾 | 「the other two have a checkbox and a picker」 |
| `docs/guide/{en,ja}/config.md` の skill 対応表 | `questionPaneEnabled` が無い |
| 同 Terminal keys の行 | 質問ペインのチェックボックスが無い |
| `TerminalKeysSection.vue` のコメント | 「The two key-behaviour settings」（実際は 3 つ描画している） |
| この plan | 「frontmatter を直した」と書いていたが直り切っていなかった |

**掃く過程で、`questionPaneEnabled` が設定ガイドに 1 行も無いことが分かった** —— UI にも skill にも
`settings-coverage.spec.ts` にもあるのに、ガイドだけ空白。列挙の修正だけこの PR に入れ、節と
全キー表への追加は [#1897](https://github.com/receptron/mulmoterminal/issues/1897) に分けた。

### 「fresh eyes で見ろ」と頼んだら、まだ 1 件あった

同じ head に対する 2 巡目で、ローカル codex に「前回 No findings だったからといって自分を追認せず、
新しい目で見ろ」と明示して依頼した。**結果、新しい P3 が 1 件出た。**

手順 2 が「macOS では `F1`–`F12` は使えない」と言い切っていたが、**同じ skill の後段（罠リスト）と
両ガイドは但し書きを持っている** —— 既定では keydown が来ないが、`Fn` かシステム設定の
Function Keys で効く。1 つのファイルの中で、前段が言い切り、後段が条件付きという状態だった。

前段を後段に合わせた（「`Fn` を押すか設定を変えた場合だけ届くので、unprompted に提案しない」）。

**これは 25 巡目に「No findings」を出したのと同じレビュアーが、26 巡目に出した指摘。**
1 度 clean が出ても、同じ head をもう 1 度読ませる価値がある、という規約の根拠がそのまま実演された。

### ゲート

`format` / `lint` / `typecheck` / `build` / `test` すべて exit 0。
`yarn test` は `d52fb64a` で **11522 passed**（+7、この PR が足したもの）。main（#1890）を取り込んだ後は **11590**。
