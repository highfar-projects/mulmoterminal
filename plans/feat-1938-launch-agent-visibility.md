# 起動エージェントを、ドロップダウンが見えない画面でも見せる (#1938)

## 問題

コレクション発チャットのエージェントは `launchAgent`（localStorage `mt-launch-agent`）が決めるが、
それを表示・変更できるのは Collections オーバーレイ右上のドロップダウン 1 箇所だけ。値はグローバルかつ
永続なので、一度 Claude 以外にすると、ドロップダウンが見えていない画面から始めたチャットまで全部その
エージェントで立ち上がる。「コレクションから始めると Claude ではなく Muse が立ち上がる。なぜ？」という
報告の正体はこれで、コードのバグではなく設定が見えないこと。

## 採る案（issue の案 C）

Claude のときは何も出さない。**Claude 以外のときだけ**、チャットを始めうるサーフェスにピッカーを出す。

`common/sessionAgent.ts:43` の既存の思想 —「Claude は既定だからバッジを出さない。付ければほぼ全行に付き、
バッジが『これは違う』を意味しなくなる」— と同じ規則をこの設定にも当てる。既定のままの人には何も増えず、
変えた人にだけ自分が変えたことが見える。

## 変更

### 1. `src/components/LaunchAgentPicker.vue`（新規）

`launchAgent` に v-model する select を 1 つの部品にする。オーバーレイに直書きされていた markup を
そのまま持ち上げるので、既存の見た目は変わらない。

props:

- `label?: string` — select の横に出す語。無いときはアイコン（`rocket_launch`）が代わりに立つ。
  幅の狭いペインで「Launch with」に 60px 使わないため。Pinned の favourites が `aria-label` + `title` に
  逃がしたのと同じ密度判断。
- `description: string` — hover の `title`。`label` が画面に無いときは `aria-label` も兼ねる。
- `nonDefaultOnly?: boolean` — 値が claude のあいだは**何も描かない**。

`nonDefaultOnly` を**選択をおこなう場所（オーバーレイ）には渡さない**。既定値のときに自分を隠す
コントロールは、既定から出るために使えない。

語は**ホストから渡す**。i18n されているのは Settings モーダルだけ（`src/i18n/en.ts` 冒頭、#1566）で、この
部品はその境界の両側で使われる。中で `t()` を呼ぶと、コレクション側のサーフェスを半分だけ移行された
bundle に引きずり込むことになる。

### 2. `src/components/CollectionsBrowseOverlay.vue`

直書きの `<span>` + `<select>` を `<LaunchAgentPicker label="Launch with" … />` に置換。常時表示のまま
（ここが「意図して変えに行く場所」）。

### 3. `src/components/CollectionsPane.vue`

ヘッダ左群の末尾に `<LaunchAgentPicker non-default-only … />`。`shrink-0` を付け、幅が詰まったときに
先に縮むのは preview の page picker（`min-w-0`）のほうにする。

カードアクションもテンプレートカードも**このペインの中**で起きるので、ヘッダ 1 箇所で覆える。

### 4. `src/components/settings/SkillLaunchConfirm.vue`

今は agent 名を読み取り専用で述べているだけ（`settings.skillConfirm.what` の `{agent}`）。同じダイアログに
ピッカーを足し、押す直前に変えられるようにする。ここは常時表示（`nonDefaultOnly` を渡さない）— 起動
そのものが目的の画面で、既定かどうかにかかわらず「何が起動するか」が主題だから。

i18n キーを 2 つ追加（en / ja）: `settings.skillConfirm.launchWith`（見える語）と
`launchWithAria`（hover / aria）。

`MODAL_FOCUSABLE`（`src/utils/focusTrap.ts:5`）は `select` を含むので、ダイアログの Tab トラップには
そのまま入る。初期フォーカスは `confirmEl.querySelector("button")`（`SettingsModal.vue:164`）＝
最初の**ボタン**なので、select を前に置いてもフォーカス先は変わらない。

## 覆わない範囲（既知の穴）

- **カスタムビュー内の chat ボタン** — ピッカーはビューの外枠（ペイン / オーバーレイのヘッダ）に出るので、
  iframe の中だけを見ている人には届かない。
- **Canvas 上のコレクションカード**（`CollectionCardView.vue`）— Canvas のヘッダはコレクション専用では
  なく、あらゆる GUI カードが載る。そこにこの chip を置くのは一般化しすぎ。

どちらも PR に明記する。

## 検証

- `test/src/components/LaunchAgentPicker.spec.ts`（新規）: claude のとき `nonDefaultOnly` が何も描かない /
  非 claude で描く / `nonDefaultOnly` 無しは claude でも描く / 選択が `launchAgent` と localStorage に届く /
  `label` 有無で accessible name の出どころが変わる。
- `test/src/components/CollectionsPaneLaunchAgent.spec.ts`（新規）: ペインのヘッダが同じ規則に従う。
- 既存 `test/src/components/SettingsModal.spec.ts` のダイアログ関連が緑のままであること。
- `yarn format` → `yarn lint` → `yarn typecheck` → `yarn build` → `yarn test`。
- 実機: `yarn dev` で Collections を開き、Launch with を Muse にしてペインとダイアログに出ることを確認。
