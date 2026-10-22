# プラグインの表示言語をアプリの表示言語に追従させる (#3170)

## 原因
- `src/composables/pluginRuntime.ts`：描画系プラグインに渡す `BrowserPluginRuntime.locale` が `ref("en")` 固定だった。コメントは「locale switcher が無い」だったが、表示言語を切り替えられるようになって古くなっていた。
- `src/composables/collectionUi.ts` / `accountingUi.ts`：`localeTag` が `browserLocale()` で、ブラウザの言語は見るが、アプリで選んだ表示言語を見ていなかった。

## 直し方
- `src/utils/pluginLocale.ts` の `pluginLocaleFor`：アプリの表示言語（`UiLocale`）を、プラグインの辞書のキー（MulmoClaude の言語コード）に変換する。gui-chat-protocol の `pickMessages` は完全一致のキーしか見ないので、`zh-CN` のままでは英語になる。`Record<UiLocale, …>` なので、表示言語が増えたら型のエラーになる。
- プラグインの locale は `i18n.global.locale` から作る `computed`。表示言語を切り替えると、プラグインの文言もその場で変わる。プロトコルの型が書き込める `Ref` なので setter を持つが、プラグインからアプリの言語は変えさせない（書き込みは捨てる）。
- コレクションと会計の `localeTag` も同じ関数を通す。

## 決めたこと
- `zh-CN` と `zh-TW` は、どちらもプラグインに一つだけある中国語の辞書 `zh` に送る。繁体字の利用者には簡体字の文言が出るが、英語よりは読める、という判断。
- MulmoClaude はホストの locale をそのまま渡している（`src/utils/plugin/runtime.ts`）。MulmoTerminal は言語コードの体系が違うので、変換をはさむ。

## 確かめたこと
- `pluginRuntime.spec.ts` に、表示言語を変えるとプラグインの locale が変わること、プラグインから書き込んでもアプリの言語が変わらないことを足した。`pluginLocale.spec.ts` は、全部の表示言語がプラグインの辞書のキーに入ることを確かめる。直した箇所を元に戻すと、どれも赤になる。
- 検証用サーバーで、ブラウザの言語を日本語にして presentHtml の確認欄が「この内容を会話に送りますか？」、直接送信の通知が「会話に送りました。」になること、表示言語を英語に切り替えると英語に追従することを確かめた。
