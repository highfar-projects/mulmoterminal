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

網羅は二重に担保される。`Messages` は `en` から導出された型なのでキー落ちはコンパイルエラー、加えて spec が `i18n.global.te()` で全ロケールを実際に引く。

**英語のまま残す語**は `ja.ts` の既存方針に従う — config.json のキー名 / skill 名 / 製品名は訳さない
（`MulmoTerminal`、`MCP`、`Web Push`、`GitHub`、`GitLab`、`Google`、`update` / `run` / `skill` / `load`）。

### B. `auto` の繁体字判定

`browserLocale()` は **変えない**。UI 以外に5つの呼び出し元があり、そこに `zh-TW` が流れると
whisper の転写・サーバーのランタイム翻訳・共有プラグインの `localeTag` が影響を受ける。
`browserLocale.ts` のコメント自身が「フルタグが要る呼び出し元は `navigator.language` を自分で読め」と言っている。

`uiLanguage.ts` の中だけで `navigator.language` のフルタグを見る:

- `zh-Hant*` / `zh-TW` / `zh-HK` / `zh-MO` → `zh-TW`（香港・マカオも繁体字）
- それ以外の `zh*` → `zh-CN`
- その他 → 従来どおり bare subtag、バンドルが無ければ `en`

`LanguageSection.vue` の autoResolved 行は `browserLocale()` を表示しているので、
繁体字ブラウザだと「`zh` なので 繁體中文 と読みます」という噛み合わない文になる。
ここは UI ロケールの決定に使ったタグを出すよう合わせる。

### C. README

- `README.ko.md` / `README.zh-TW.md` を追加（`ja` / `zh` と同じ要約版の構成）
- 全 README 先頭の言語行を5言語に更新
- `README.zh.md` は改名しない（外部からの流入リンクと ChangeLog / guide の参照が名前で向いている）

## テスト

`test/src/components/settings/languageSection.spec.ts`

- "translates every key the English bundle declares" は今 `ja` しか見ていない。**全ロケールを回す**ようにする。
  これが本体の担保: 型はキーの存在しか見ず、`te()` は実際に引けるかを見る
- `auto` の解決に繁体字・簡体字・韓国語のケースを足す。**`zh-HK` と `zh-Hant-TW` を含める** —
  リージョンだけ見ると落ちる2つで、ここが今回の唯一の分岐らしい分岐
- ピッカーが5言語を出すことを見る

`test/src/utils/browserLocale.spec.ts` は**変えない**。変わっていないことの証拠になる。

## やらないこと（#2173 に記載）

- Settings 以外の UI 文言の i18n 化（`CockpitHeader` の `STATUS_WORD` / `WORK_WORD`、
  `TerminalCell` の `STATUS_LABEL`、`rosterPhase.ts` のフェーズ語）
- `docs/guide` の翻訳
- `translateUi.ts` のランタイム翻訳を繁体字対応にすること
