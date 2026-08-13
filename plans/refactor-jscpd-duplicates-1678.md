# refactor: code scanning の duplicate-code アラート 4 件を抽出で解消する (#1678)

`duplication-scan` (jscpd 5.0.12, minTokens=50 / minLines=5) の open アラートは 6 件。
SARIF は**片側の位置しか持たない**ので、対を知るには CI と同じ引数でローカル実行する
（`plans/refactor-jscpd-duplicates-1472.md` と同じ手順）:

```
npx jscpd@5.0.12 . --format "typescript,vue" \
  --ignore "**/node_modules/**,**/dist/**,**/*.d.ts,**/*.spec.ts" --reporters console
```

`a6db239c` で 6 clones。Code Scanning の open 6 件と一致する。この PR はうち **4 件**を扱う。

| alert | 片側 | 対 | tokens |
| --- | --- | --- | --- |
| 154 | `src/components/CollectionsBrowseOverlay.vue` 52-68 | `src/components/CollectionsPane.vue` 169-185 | 92 |
| 156 | `src/components/cellChromeBinding.ts` 58-65 | 同ファイル 79-86 | 62 |
| 155 | `server/backends/remoteView.ts` 118-125 | 同ファイル 339-342 | 53 |
| 161 | `server/backends/sharedApp/deploy.ts` 270-278 | `server/backends/sharedApp/publish.ts` 328-336 | 64 |

## 161 — 共有ビルダーは既にあり、誰も呼んでいない

`server/backends/sharedApp/context.ts` の `stampFor` が、まさにこの重複のために書かれている:

> Who, when, and from which commit — resolved the same way by both operations.
> Sharing the builder is what keeps the two from drifting into stamping different clocks, or
> dropping `dirty` on one side

にもかかわらず**呼び出し元が 0 件**で、deploy と publish は各々インラインで同じ 6 行を綴っている。
返り値 `{ stamp, dirty }` は両者が実際に必要としているもの — 両ファイルとも後段で
`stampSource.dirty === true` を結果に載せており、これは `stampFor` の `dirty` と同一式。
よって**新しい API は作らず、既存の `stampFor` に繋ぐ**。`gitStamp` の import は
両ファイルで不要になるので落とす（`PublishStamp` 型は別の箇所で使うので残る）。

## 154 — 17 行が byte 一致。置き場所は新しい composable

`diff` で完全一致。両者とも `../composables/collectionUi` から push/pop を import しており、
`CollectionsPane.vue` のコメントは既に片方を参照で済ませようとしている
（"same getRootNode() trick as CollectionsBrowseOverlay, which is where the comment explaining
it lives"）。

`src/composables/useCollectionTeleportTarget.ts` を新設し、probe の `Ref` を受けて
登録・解除・巻き戻しを持つ。`collectionUi.ts` に足さないのは、あちらが
`configureCollectionUi` を含む 382 行のホスト束ねで、Vue のライフサイクルを持つ関数の
置き場ではないため。push/pop の実体はあちらに残す（この composable がそれを import する）。

**`CollectionCardView.vue` は変えない。** 同じ登録をしているが `onMounted` で一度だけ行う形で、
probe が後から現れる 2 つとはライフサイクルが違う。watch 版に寄せるのは純粋抽出ではなく
挙動の変更なので、この PR では触らない（jscpd も 50 トークン閾値で拾っていない）。

## 156 — 同じファイルが自分のコメントに反している

`cellShellEvents` のコメントは "One object so the two callers do not each re-spell seven
identical handlers — which is exactly what CellShell was extracted to stop" と書いているのに、
その 10 行上で `cellChromeBinding` が同じ 6 件を綴っている。

`toggle-*` 6 件だけを作る関数を出し、両方から spread する。`close` の扱いは**現状維持**:
`cellChromeBinding` では引数（TerminalCell が破棄前に確認するため、#826）、
`cellShellEvents` では固定の転送。`move` も `cellShellEvents` 側に残す。

## 155 — 文面が 1 箇所で直らない

`remoteViewFailureMessage` / `remoteViewItemsFailureMessage` / `mutateRemoteViewFailureMessage`
の 3 つが `view-not-found` と `not-mobile` の同一文面を持つ。これらは電話側のエラー UI の全部で、
片方だけ直ると同じ状況に別の説明が出る。共有している 2 文面を関数として出し、3 関数から呼ぶ。

**文面だけ畳んでも足りなかった。** 最初は共有する 2 文面を関数に出したが、jscpd は
55 tokens で依然として拾った（53 → 55）。残っていたのは文面ではなく、3 関数それぞれが
同じ 2 分岐を綴っているという構造そのもの。

そこで**2 つの kind を対で受ける 1 つの関数**にし、各呼び出し側は
`if (result.kind === "view-not-found" || result.kind === "not-mobile") return sharedViewFailureMessage(result, slug);`
の 1 行で両方を消す。kind ごとに関数を分けると 2 行残って畳みきれず、かつ後段の
`unhandledFailure(result, slug)` が要求する `never` への絞り込みも壊れる。
対で扱うことが網羅性検査を保つ条件になっている。

## 扱わない 2 件

| alert | 場所 | 理由 |
| --- | --- | --- |
| 160 | `sharedApp/deploy.ts` 247-268 ↔ `publish.ts` 298-309 | 早期 return を含む前置き。畳むと両経路の失敗の返り方が変わり得るので純粋抽出ではない |
| 153 | `useTerminalConnections.ts` 829-842 ↔ 880-892 | `submitText` / `pasteAndSubmit` の実入力パス。60ms と `PASTE_SUBMIT_MS`、bracketed paste の有無、空文字ガードの有無が絡む。`/refactor-safely` + 実機確認を伴う別 PR |

## 検証

1. 上の jscpd コマンドで clone が **6 → 2**（残るのは 160 と 153 のみ）。
   抽出が中途半端だと 50 トークンを割らずに残るので、目視ではなく実際に回して確認する
2. `yarn format` / `yarn lint` / `yarn typecheck` / `yarn build` / `yarn test`
3. 挙動の担保は既存 spec:
   - 156 → `test/src/components/cellChromeForwarding.spec.ts`。期待値を
     `CellChromeButtons` の宣言済み emits から**導出**しており、`Object.keys(chromeEvents)` の
     集合と、各ハンドラが自分の名前で再 emit することの両方を見ている。spread 化はキー集合も
     順序も変えないので、この spec がそのまま抽出の担保になる
   - 161 → `test/server/backends/sharedApp/` の deploy / publish spec。`opts.now` と
     `opts.resolveCommit` を注入して stamp を確かめているので、共有側に繋いだ後も
     両経路から uid / email / publishedAt / commit / dirty を確認できる
   - 155 → 文面を assert している既存 spec
4. 154 は元々 spec を持たない。抽出で唯一壊れうるのは「composable の中で登録した
   `onBeforeUnmount` がコンポーネントに紐づくか」で、これは型でも既存テストでも捕まらない。
   `test/src/composables/collectionTeleportTarget.spec.ts` を新設して、jsdom の
   `attachShadow` で probe を作り、①出現時の push ②差し替え時に前の root を先に pop
   ③unmount 時の pop ④shadow root 外の probe を無視、の 4 点を見る。

   **この spec が空回りしていないことを変異で確認済み**: `onBeforeUnmount` を外す /
   watch 先頭の `unregister()` を外す / `instanceof ShadowRoot` ガードを外す、の 3 つの
   壊し方それぞれが、対応する別々のテスト 1 件だけを落とす。
