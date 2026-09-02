# fix(theme): 設定到着後に xterm のパレットを塗り直す (#1943)

## 症状

カスタムテーマ（`config.json` の `themes`）を選んだ状態でタブを再読み込みすると、パネルやヘッダーは
カスタムテーマの色になるのに、xterm の背景だけがビルトイン既定の Midnight (`#1a1a2e`) のまま残る。
Settings で別のテーマを選び直すと直るが、再読み込みのたびに再発する。

## 原因

`Terminal.vue` の xterm パレット用 watch が、パレットの入力を**列挙**していて、そのうち一つを取り
こぼしていた。

```ts
watch([themeId, () => dirConfig.value.theme, () => dirConfig.value.colors], () => {
  conn.setTheme(slotKey, effectiveTermTheme());
});
```

再読み込み時の順序は次のとおり。

1. `localStorage` の `theme` はカスタム id。`isThemeIdLike` を通るので `themeId` にその id が入る。
2. `/api/config` はまだ届いていないので `customThemes` は空。`applyTheme` の `findCustomTheme` が
   null を返し、`data-theme` は既定の `midnight` になる。
3. この間に Terminal が mount され、`termThemeFor(id)` も空振りして `THEMES[0].term`（Midnight）で
   xterm が確定する。
4. `/api/config` 到着 → `useAppConfig` が `setCustomThemes(c.themes)` → `refreshTheme()`。これは
   `:root` の CSS 変数だけを塗り直すのでクロームは正しくなる。
5. **xterm には誰も通知しない。** `themeId` の値は再読み込みの前後で変わらないので上の watch は
   発火せず、canvas だけ Midnight のまま残る。

`dirConfig` にカスタムテーマを pin したセル（`termThemeFor(theme)` 経路）も同じ理由で取り残される。

すぐ下のフォント用 watch は同種のレースを既に踏んでいて、`globalFontFamily`（同じく `/api/config`
由来）を watch に入れて解決してある。テーマ側だけその「設定到着」ソースが欠けていた。

## 修正方針

入力の列挙をやめ、**解決済みのパレットそのもの**を watch する。

```ts
const termTheme = computed<ITheme>(() => effectiveTermTheme());
watch(
  () => JSON.stringify(termTheme.value),
  () => conn.setTheme(slotKey, termTheme.value),
);
```

- `effectiveTermTheme()` が読む reactive な値（`themeId` / `customThemes` / `dirConfig.theme` /
  `dirConfig.colors`）を computed が自動的に追跡するので、入力を一つ書き忘れる余地がなくなる。
  今回のバグはまさに「列挙し忘れ」なので、列挙そのものを消すのが再発防止になる。
- 直接 `termTheme` を watch せずシリアライズしたキーを見るのは、`setCustomThemes` が毎回新しい配列を
  代入するため。色が同じでも identity が変わり、カスタムテーマを使っていない大多数のユーザーの全セルに
  無意味な repaint を押し付けてしまう。「ディレクトリが何も pin していないときは app-wide の値に触らない」
  という既存 spec と同じ姿勢。

`attach()` に渡す初期値は `effectiveTermTheme()` のままで変えない。

## テスト

`test/src/components/TerminalDirFontApply.spec.ts` に describe を追加する（`useTerminalConnections`
を差し替えて `setTheme` の呼び出しを捕まえる seam が既にあるため、新ファイルにすると mock を丸ごと
複製することになる）。

1. カスタムテーマ id を選択済み・`themes` 未到着の状態で mount → `attach` は Midnight。その後
   `setCustomThemes([...])` を呼ぶと `setTheme` にカスタムテーマの色が届く。
2. カスタムテーマを使っていない場合、`setCustomThemes` の到着だけでは `setTheme` を呼ばない
   （空配列でも identity が変わる、という上記の懸念を固定する）。

## 影響範囲

`conn.setTheme` の呼び出し元は `Terminal.vue` のこの 1 箇所だけ。

## 実機確認

`dist` をビルドして、スクラッチ HOME（`themes` に `washi` を登録、実設定には触れない）でサーバーを
起動し、Shell セルを開く → `theme` を `washi` にしてタブを再読み込み、という報告どおりの手順を
Playwright で実行した。

- **修正なし**: クローム（ヘッダー・セルヘッダー）は washi のクリーム色になるのに、ターミナル領域だけ
  Midnight の濃紺のまま。報告と一致。
- **修正あり**: 再読み込み直後からターミナル背景も `#ece7dc`。
- `extends: "daylight"` + 一部キーのみのテーマでも同じく正しく塗られることを確認（ビルトインを
  base にした導出パスも通る）。

備考: 検証中、借用した Playwright の Chromium が 112 で `AbortSignal.any` を持たず、
`fetchWithTimeout` がリクエスト発行前に throw して `/api/config` が一度も飛ばない、という
偽の症状を踏んだ。アプリ側の問題ではないが、この repo を古いブラウザで検証すると設定が
まったく読まれない状態を「テーマのバグ」と見誤るので記録しておく。
