# 「チャットを開始」ダイアログに起動エージェントのピッカーを出す (#1945)

## 問題

#1938 / PR #1940 で、コレクション発チャットの起動エージェントをオーバーレイ・セル内ペイン・
Settings の 3 面で見せて変えられるようにした。残った穴が 1 つ:

plugin の `CollectionChatModal` は `fixed inset-0` + `backdrop-blur-sm` で画面全体を覆うので、
**押すまさにその瞬間だけ**ヘッダのピッカーがぼかされて見えない。本来いちばん置きたい場所だが、
この modal は `@mulmoclaude/collection-plugin` のものだった。

plugin 側に slot を開ける依頼（receptron/mulmoclaude#3026 / PR #3027）は完了し、
**`@mulmoclaude/collection-plugin@4.6.0`** として公開済み。こちらで埋める。

## 変更

1. 依存を `^4.6.0` へ。
2. `<CollectionView>` を描く 2 箇所 — `CollectionsBrowseOverlay.vue` と `CollectionsPane.vue` —
   に `#chat-modal-options` を渡す。
3. `src/components/ChatModalAgentPicker.vue`（新規）を差し込む。

## なぜ `LaunchAgentPicker` を再利用しないのか

**slot の中身は plugin の shadow root で描かれる。** そこに注入されるのは plugin の Tailwind
シートだけ（`src/collectionShadowCss.ts`）で、**クラス規則は shadow 境界を貫通しない**。
出荷されているシートを実測したところ、MulmoTerminal のテーマ utility は 1 つも入っていない:

| class | plugin のシートにあるか |
|---|---|
| `bg-input` / `text-fg` / `border-border` / `text-dim` | **無い** |
| `text-slate-600` / `border-slate-200` / `bg-white` / `h-8` / `text-xs` … | ある |

つまり `LaunchAgentPicker` をそのまま置くと、白いカードの上に**素の `<select>`** が出る。型は
何も言わないし、markup はどちらでも正しいので、component テストでも捕まらない。

そこで modal 自身の light card の語彙で描く。これは「使える唯一の選択肢」であると同時に
**正しい選択**でもある: あのカードは MulmoTerminal がどのテーマを着ていても白いので、
ピッカーは背後のアプリではなくカードに属する。

## 常時表示にする

ペインのチップは `nonDefaultOnly`（驚きのある答えだけ印を付ける）。この modal は**起動そのものが
主題**なので、Settings の `SkillLaunchConfirm` と同じく常に出す。「Claude です」も読む価値のある
答えになる。

## 覆わない範囲

Canvas のコレクションカード（`CollectionCardView.vue`）。`GuiPanel.vue` が常に
`sendTextMessage` を渡す埋め込み経路なので、**plugin 側が slot を withhold する** —
チャットは今動いているセッションに入り、`launchAgent` は関与しない。

## 検証

- `test/src/components/ChatModalAgentPicker.spec.ts` — 挙動（値が届く／既定でも出る／選択肢）。
- `test/scripts/chat-modal-picker-shadow-css.spec.ts` — **この変更の本丸の guard**。
  component の template が使うクラスを、出荷済み plugin シートに突き合わせる。`node:fs` が要る
  ので node 型のプロジェクト側に置く（`test/src/**` は DOM プログラムで node 型を持たない —
  `test/config/**` が同じ理由でそちらにいる）。`tailwind-font-mono.spec.ts` が同じ形の検査。
  **guard が噛むことを確認済み**: `text-dim` を入れると赤、戻すと緑。
- **実機**（build 成功 ≠ 動作する。リスクの本体が shadow 境界をまたぐ CSS なので、green な
  テストは何も証明しない）: 隔離した `HOME` と別ポートで `yarn dev` を起動し、Playwright で
  オーバーレイ経路とペイン経路の両方から modal を開いて確認。console error は 0。
  計測した computed style: `bg #fff` / `color oklch(0.446 …)=slate-600` / `border slate-200 1px` /
  `height 32px` / `radius 4px` / `font-size 12px` / `cursor pointer` — すべて意図どおり適用。
