# i18n: キーボードショートカット一覧のアクションのラベルを翻訳する (#1894)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 現在のコードの仕様はコードが唯一の情報源。数値は sha に紐づけて書くこと。

## 症状

**設定 → キーボードショートカット**の一覧で、**アクションのラベルだけが英語のまま**。日本語表示でも
`Enlarge / collapse a terminal` / `Jump to a terminal that needs you` などがそのまま出る。

同じ行の右側（「未設定」）も、節の見出しも、説明文も、下のボタンも日本語なので、**一覧の左半分だけが
英語**という状態。#1892 で足した `send` の行は i18n を通っているため、**11 行のうち 1 行だけが日本語**
という並びになっていた。

## 原因

`src/components/keymapLabels.ts` の `LABELS` が**ハードコードの英語**で、i18n キーではない。
この節の他の文字列（`settings.shortcuts.*`）はすべて `src/i18n/{ja,en}.ts` にある。

## 壊してはいけない性質

`LABELS` が `Record<KeymapAction, string>` である理由が同ファイルのコメントに書いてある:

> A full Record, not a lookup with a fallback: adding an action to `KEYMAP_ACTIONS` then **fails to
> compile until it is named here**, so a new shortcut can't ship invisible to the one screen that
> tells the user it exists.

**i18n キーを `` `settings.shortcuts.actions.${action}` `` のように導出するとこの網羅性が消える**
（アクションを足しても型エラーにならず、実行時にキーパスが描画されるだけになる）。
`Record<KeymapAction, string>` のまま**値を i18n キーに置き換える**形なら保たれる。

## 直し方

1. `keymapLabels.ts`: `LABELS` → `LABEL_KEYS: Record<KeymapAction, string>`、値は i18n キー。
   `KeymapRow.label` → `labelKey`
2. `src/i18n/en.ts` に `settings.shortcuts.actions.*` を 10 個追加 →
   **`Messages` 型が en の形から導出され `ja: Messages` なので、ja に足すまで型エラー**になる
   （既存のガードがそのまま効く）
3. `KeyboardShortcutsSection.vue`: `{{ row.label }}` → `{{ t(row.labelKey) }}`
4. 既存 spec 2 本（`keymapLabels.spec.ts` / `activeKeymap.spec.ts`）が `.label` を読んでいるので追随

## 検証（計画）

- **全アクションが両ロケールで翻訳されていること**を spec で pin する。型は「キーがある」ことしか
  見ない（値が英語のままでも通る）ので、**値**を見る必要がある
- break-verify: ラベルを 1 つ英語のまま戻すと赤くなること

## 実装（2026-08-29）

- `keymapLabels.ts`: `LABELS` → `LABEL_KEYS`（`Record<KeymapAction, string>` のまま、値が i18n キー）、
  `KeymapRow.label` → `labelKey`。**キーを導出しなかった理由**をコメントに書いた —— 導出すると
  網羅性チェックが消え、アクションを足しても型エラーにならず実行時にキーパスが描画される
- `src/i18n/{en,ja}.ts` に `settings.shortcuts.actions.*` を 10 個
- `KeyboardShortcutsSection.vue`: `{{ t(row.labelKey) }}`
- 既存 spec 2 本が `.label` を読んでいたので追随（`sendRows` の `label` は別物なので触らない）

### 型はキーの存在しか見ない

`Messages` は en の形から導出され `ja: Messages` なので、**キーを落とせば型エラー**になる。
ただし**キーがあって中身が英語**なら型は通る —— このリポジトリが繰り返し踏んでいる
「半分だけ翻訳された状態」がそれ。`keymapLabels.spec.ts` に**値**を見る spec を足した:

- 全アクションが en で非空
- 全アクションが ja で非空、**かつ en と異なり、かつ CJK を含む**

break-verify（各回 byte-identical 復元）:

| ミューテーション | 結果 |
|---|---|
| ja の 1 つに英語をそのまま貼る | 1 red |
| ja の 1 つを空文字にする | 1 red |

### #1892 のスクリーンショットを差し替えた

ja のガイドに貼った画像は**アクションのラベルが英語のまま**の状態を写しており、注記も付けていた。
両方とも撮り直し、注記を削除。**#1892 の plan に「文言を変えたら画像を撮り直す」と書いた危険が、
別 PR でも同じように発生した**ことになる。

ゲート: `format` / `lint` / `typecheck` / `build` / `test` すべて 0。
`yarn test` は **11600 passed**（+20、この PR が足したもの）。
