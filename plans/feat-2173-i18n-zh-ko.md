# feat(i18n): 简体中文 / 繁體中文 / 한국어 を足す (#2173)

## 目的

UI の言語に `zh-CN` / `zh-TW` / `ko` を足し、README を韓国語と繁体字でも用意する。

## 今の形

- バンドルは `en` / `ja`（`src/composables/uiLanguage.ts` の `UI_LOCALES`、`src/i18n/index.ts` の `messages`）
- 翻訳範囲は Settings モーダルのみ。`src/i18n/en.ts` のトップレベルは `settings` だけ
- README は English / 日本語 / 简体中文

## 変更

### A. ロケール3つ

1. `src/i18n/zh-CN.ts` / `zh-TW.ts` / `ko.ts` — `Messages` 型で `en` の全キーを訳す
2. `src/composables/uiLanguage.ts` の `UI_LOCALES` に3行足す
3. `src/i18n/index.ts` の `messages` に3つ登録する

網羅は二重に担保される。`Messages` は `en` から導出された型なのでキー落ちはコンパイルエラー、
加えて spec が `i18n.global.te()` で全ロケールを実際に引く。この二重化は実際に効いた —
`origin/main` が `settings.surviving.sweep*` を足したとき、型とテストと reviewer が同時に捕まえた。

**英語のまま残す語**は `ja.ts` の既存方針に従う — config.json のキー名 / skill 名 / 製品名は訳さない
（`MulmoTerminal`、`MCP`、`Web Push`、`GitHub`、`GitLab`、`Google`、`update` / `run` / `skill` / `load`）。

### B. `auto` の解決は CLDR に聞く

`browserLocale()` は **変えない**。UI 以外に5つの呼び出し元があり、そこに `zh-TW` が流れると
whisper の転写・サーバーのランタイム翻訳・共有プラグインの `localeTag` が影響を受ける。
`browserLocale.ts` のコメント自身が「フルタグが要る呼び出し元は `navigator.language` を自分で読め」と言っている。

判定は `uiLanguage.ts` に閉じ、**タグの列挙ではなく `Intl.Locale#maximize()` に問い合わせる**:

1. そのタグの **言語** が漢字で書かれるか — 言語 subtag だけを maximize して判定する。
   `zh` / `yue` / `nan` / `hak` / `wuu` / `lzh` は Han、`en` / `fr` / `ja` / `ko` は違う。
   この問いは省略できない。`maximize()` は明示されたスクリプトを保持するので、
   `en-Hant` のような整形式のタグが `Hant` を返し、英語ブラウザに繁体字 UI が出る。
2. **そのタグ** のスクリプト。明示スクリプトは地域に優先するので `zh-Hans-HK` は簡体字、
   `zh-Hant-CN` は繁体字。
3. スクリプトがどちらの Han でもないとき（`zh-Latn` ピンイン、`zh-Bopo` 注音、`yue-Latn` 粤拼）は
   **地域** で決める。ローマ字版のバンドルは無く、中国語話者には英語より中国語バンドルのほうが良い。
   地域も CLDR に聞く（`scriptInRegion`）—— 手書きの `{TW, HK, MO}` は華僑地域を取りこぼす。

パースできないタグ（RFC 5646 の extlang 形式 `zh-yue` は valid BCP 47 だが UTS 35 では不可）は
`retryTag` が **extlang を** 再試行する。`zh-yue` の正準形は `yue` であって `zh` ではない。

失敗はすべて閉じる方向 — 知らない言語や別のスクリプトは素の subtag 経路に落ち、
これは3ロケールが増える前と同じ挙動。

### C. 「要求されたタグ」と「解決結果」を分ける

Settings の行は「your browser asks for X, so this reads as Y」。X に解決結果を入れると
`zh-CN` ブラウザでは循環し、言語をまたいだ解決では**偽になる**（`yue-HK` のブラウザに
「zh-TW を要求した」と言う）。`browserLanguageTag()` が生のタグを返して X を埋め、
`browserUiLocale()` は module-private で `resolveUiLocale` だけが呼ぶ。

### D. README

- `README.ko.md` / `README.zh-TW.md` を追加（`ja` / `zh` と同じ要約版の構成）
- 全 README 先頭の言語行を5言語に更新
- `README.zh.md` は改名しない（外部からの流入リンクと ChangeLog / guide の参照が名前で向いている）

## テスト

`test/src/components/settings/languageSection.spec.ts`

- 網羅チェックは **`UI_LOCALES` を回す**。バンドルを足す行為そのものが網羅の対象になる
- `auto` の解決表。漢字を書く言語（`yue` / `cmn` / `nan` / `hak` / `wuu`）、スクリプトが
  地域に優先する両方向、extlang、非 Han スクリプト、そして **言語が中国語でないのに
  スクリプトが Han のタグ**（`en-Hant`）を含む
- ステッパーの単位は**描画された文字列**として固定する。`{{ value }}{{ unit }}` に区切りは無く、
  中国語は数字と単位を密着させ、韓国語は分かち書きする
- Settings の行が「ブラウザが要求したタグ」を出すことを固定する

`test/src/utils/browserLocale.spec.ts` は**変えない**。あの関数が変わっていないことの証拠になる。

**各ガードは、外すと赤くなる行を持つ。** レビュー中に12の変異を走らせ、毎回 SHA-256 で復元を確認した。
`trim()` ガードは**どの行も殺せなかったので削除した** —— 空白は `resolveUiLocale` の
バンドル照合で英語に落ちるため、そのガードは何もしていなかった。

## やらないこと（#2173 に記載、#2182 に分離）

- Settings 以外の UI 文言の i18n 化（`CockpitHeader` の `STATUS_WORD` / `WORK_WORD`、
  `TerminalCell` の `STATUS_LABEL`、`rosterPhase.ts` のフェーズ語）
- `docs/guide` の翻訳
- `translateUi.ts` のランタイム翻訳を繁体字対応にすること

## 残るリスク

翻訳そのもの。構造的な検査（キー集合・型・プレースホルダ集合・vue-i18n の危険文字・
簡繁の混入・主要語の一貫性・句読点の全半角）はすべて通っているが、**どれも文を読んでいない**。
`sweepUnit` に英語式の空白が入っていたのがその証拠で、ネイティブレビューが実際の gate。
