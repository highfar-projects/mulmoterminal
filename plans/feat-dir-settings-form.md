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

書き込みはキー単位で、他のキーは読み直したファイルの上に足すので、エージェントが同時に別のキーを書いても消えない。
同じキーを両方が書いた場合は後勝ちになるが、フォームは保存後の値を表示し直すので、画面と実際が食い違ったままにはならない。

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
