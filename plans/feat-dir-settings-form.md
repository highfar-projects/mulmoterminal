# feat: ディレクトリごとの設定を設定画面のフォームで変える（#2722 / 最初の子 #2723）

## 何をするか

設定画面 → Directory settings で行を展開すると、今は `.mulmoterminal.json` の中身を読むだけ（`DirConfigPreview`）。
そこにフォームを足し、キーを一つずつ変えられるようにする。Files ペインでの編集は残す。

#2723 で入れるのは、全部の子で使う **書き込みの口** と、見た目の基本のキー:
`name`、`badgeColor` / `headerColor` / `headerTextColor` / `cellColor` / `cellBorderColor` / `dotColor` / `buttonColor`、
`fontSize`、`fontFamily`、`orderPriority`、`theme`。

## サーバ

- `PUT /api/dir-config` — body `{ cwd, set: { key: value }, unset: [key] }`。答えは新しい `dirConfigDetail`。
  - `cwd` は `existingWorkspaceFromQuery`（あるディレクトリだけ）。
  - キーはフォームが扱うキー（`common/dirConfigForm.ts` の `DIR_FORM_KEYS`）だけ。値は `writableDirConfigSchema` のそのキーの定義で検証し、通らなければ 400。
  - 書く先: `set` はそのキーが今 `.mulmoterminal.local.json` にあれば local、無ければ共有の `.mulmoterminal.json`（無ければ作る）。`unset` は両方のファイルから消す。
  - 触るファイルが壊れた JSON / オブジェクトでないときは 422 で書かない（手で書いた中身を上書きで消さない）。
  - フォームに無いキーと並び順は残す。インデントはファイルのものに合わせる。書く前に Files と同じバックアップを取る。
  - 書いたら `DIR_CONFIG_CHANNEL` を流す（Files ペインの保存やエージェントの書き込みと同じ）。
- 読み出し: `dirConfigDetail` に `formValues`（共有 + local の生の値。`DIR_FORM_KEYS` のものだけ）を足す。
  解決後の値（`config`）は `repo.json` も混ざるので、フォームには「このファイルに書いてある値」を出す。
  `sound` のパスのような、ブラウザに渡していない値はキーを足すときに一緒に判断する。

### 409 を入れない理由

書き込みはキー単位で、保存のたびにファイルを読み直してその上に足すので、保存より前に書き終わった別のキーは消えない。
消え得るのは、別のプロセス（エージェントの Write など）が、この保存の「読む → 書く」の間に同じファイルを書いたときだけ。
この処理は同期で、同じサーバの中の書き込みは割り込めない。残る隙間は数回のシステムコール分で、
Files エディタの条件付き書き込み（版の確認 → 書き込み）と同じ幅なので、同じく後勝ちとして受け入れる。
読み直してから書くようにしても、読み直しと書き込みの間に同じ隙間が残るので、失敗の道が増えるだけで保証は増えない。
フォームは保存後の値を表示し直すので、画面と実際が食い違ったままにはならない。

## 画面

- `DirConfigPreview` の展開部分（ディレクトリがある行）に `DirSettingsForm` を置く。ファイルが無いディレクトリでも出す（最初の保存でファイルができる）。
- 1 行 1 キー: 名前、操作、「全体に従う」（ファイルにそのキーがあるときだけ。押すと `unset`）、local にある値には印。
- 保存は変更が確定したとき（テキストは blur / Enter、色・選択は change）。保存中は操作を止め、失敗したら元の値に戻して理由を出す。
- 文言は `src/i18n/dirSettingsForm/{en,ja,ko,zh-CN,zh-TW}.ts`。

## 純粋関数（テストしやすい形）

- `server/config/dir-config-edit.ts`: 要求の解釈（`parseDirConfigEdit`）、キーごとの書き先の振り分け、JSON テキストへの適用（`applyEditToText`）。fs を触らない。
- `src/components/dirSettingsFormFields.ts`: フォームの行の定義と、入力値 → `set` / `unset` への変換。

## ドキュメント

README の Settings の節、`docs/guide/{en,ja}/config.md` の per-dir 節、`mulmoterminal-dirs` skill、
`test/server/config/settings-coverage.spec.ts` の `ui: true`。

## #2724: 状態色と端末の配色

`headerStatusTint`、`headerStatusColors`、`colors` を `DIR_FORM_KEYS` に足す。

- `headerStatusTint`: 一行の選択（全体の設定 / 2 つの見せ方）。
- `headerStatusColors`: 全体設定用の `HeaderStatusColorsEditor` を、値を props で受けて次の値を emit する形に変え、
  全体設定（`GlobalHeaderStatusColors.vue` が今までどおり config.json に保存）とディレクトリのフォームの両方で使う。
  ファイルには `null` を書けないので、`headerStatusColorsForFile`（`common/headerStatusColors.ts`）で
  「背景だけなら hex 一つ、両方なら object、文字だけなら `{ text }`」に直してから保存する。
  ディレクトリのこのキーは全体の組を丸ごと置き換える（既存の `mergeHeaderStatusColors` の規則）ので、画面にそう書く。
- `colors`: 新しい `DirPaletteEditor.vue`。xterm の 23 色を畳んで並べ、一色ずつ変える / テーマの色に戻す。
- 組ごとに編集するキーは、空になったらファイルから消す（`editForSet`）。空の組で全体の値を上書きしないため。

## #2725: モデル・終わりの要約・追加のディレクトリ

`provider`、`model`、`appendSystemPrompt`、`addDirs` を足す。

- `provider` / `model`: 一つの選択（`DirModelSelect.vue`）。`/api/launch-options` の、全体の設定に登録済みのプロバイダとモデルを並べる（起動フォームと同じ一覧）。
  選ぶと両方を書き、「指定しない」で両方を消す。ファイルに一覧に無い組があれば「ファイルの値」として出し、開いただけで変わったように見せない。
- `appendSystemPrompt`: 全体に従う / 付ける / 付けない の選択で、真偽値を書く。
- `addDirs`: 一行ずつの編集（`DirAddDirsEditor.vue`）。書いたとおり（相対 / 絶対）に保存し、空になったらキーを消す。存在するかは読み込み側（`resolveAddDirs`）が決める。

## #2726: アイコン・端末の背景・知らせる音

`icon`、`backgroundImage`、`sound`、`sounds` を足す（`DirMediaSection.vue` にまとめる）。

- `icon`: 自動で探す（キー無し）/ 出さない（`false`）/ 画像を指定（パス・URL）。画像を選んでもパスを入れるまでは書かない。
- `backgroundImage`: 画像・濃さ・合わせ方。濃さと合わせ方が既定なら文字列一つ、違うものだけ object に書く。画像を空にするとキーを消す。
- `sound`: 全体に従う / 同梱の音 / このディレクトリのファイル。`sounds`: 種類ごとに同じ選択で、「上と同じ」は種類を外し、空になったらキーを消す。
- これまで `sound` の生のパスはサーバの中だけにあったが、フォームで今の値を見せるため `formValues` でブラウザに渡すことにした。同じファイルは Files で中身ごと開けるので、ブラウザから新しく見えるようになるものは無い。
- 全体の `sound` はこれまでファイルのパスしか読まず、`preset:<id>` を書くと黙って捨てられていた（`sounds` は受け付ける）。フォームは両方に同じ選択を出すので、読み込み側で `sound` も `resolveDirSoundValue` で読み、同梱の音を受け付けるようにした（Codex round 1）。
- 背景の object に、このフォームが扱わない項目があれば、保存してもそのまま残す。

## #2727: ヘッダーのボタン・チップ・コマンド

`buttons`、`chips`、`commands` を足す。全体用の `HeaderButtonsEditor` / `HeaderChipsEditor` をそのまま使う。

- 一件ごとの変更（追加・編集・削除・移動・フォルダ）は、これまで全体のルートの中にあった「要求 → 変更」の読み取りを
  `server/config/header-entry-changes.ts` に出し、全体のルートと新しい `POST /api/dir-config/entries` の両方から使う。
  全体のルートは振る舞いを変えない（旧ルートと新ルートを生成した要求で並べて、応答と設定が一致することを確かめた）。
- 未設定の一覧の意味だけが違う。全体は組み込みの並びから始まり「組み込みに戻す」で消える。ディレクトリは空から始まり「全体に従う」で消える。
- 編集画面は、読む一覧と変更の送り先を provide / inject で受け取る（既定は全体）。関数を props で渡さないため。
- コマンドにはフォルダを出さない。
- コマンドの新しい id は、このディレクトリで実際に出るヘッダーのボタン（全体と合わせたもの）の id と重ならないようにずらす。重なると `mergeHeaderConfig` がパレットから落とすため（Codex round 1）。

## #2728: skills・decks・worktreeEnv と、共有 / local の切り替え

これでファイルに書けるキーがすべてフォームに入る（`DIR_FORM_KEYS` と `DIR_CONFIG_KEYS` が一致することを spec で固定）。

- `skills` / `decks`: `addDirs` の一覧編集を `DirStringListEditor.vue` に一般化して使う。`skills` は並べ替えられ、`/api/skills?unfiltered=1`（このディレクトリで見える skill すべて）を候補に出す。絞り込み済みの一覧からは絞り込みを編集できないため。
- `worktreeEnv`: 変数ごとに種類（port / 一意な名前）と値。空になったらキーを消す。
- 共有 / local: 各行に「この checkout だけにする / 共有に戻す」。`POST /api/dir-config/move` が値を書いてあるまま移す（両方のファイルを計算してから書く）。モデルの行は 2 つのキーなので出さない。ヘッダーの一覧も出さない（それぞれの編集画面の中に行が無いため）。

## #2729: セルからそのディレクトリの設定を開く

セルのパスメニューに「このディレクトリの設定」を足す。`openDirSettings(dir)` が設定画面を Directory settings で開き、
`requestedSettingsDir` をその画面が一度だけ受け取って、そのディレクトリの行を開いてスクロールする。
最近のディレクトリの一覧に無いディレクトリでも行を足して出す。
