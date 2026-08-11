# feat: 共有コレクション — 実装順 5「publish（git → Firestore）」

**Status**: 未着手（このファイルは着手する人への引き継ぎ）
**日付**: 2026-08-11
**親プラン**: [`plans/feat-shareable-collections.md`](./feat-shareable-collections.md) — **先に読むこと。**
**前のステップ**: [`feat-shareable-collections-step3-store.md`](./feat-shareable-collections-step3-store.md)（完了、mulmoclaude #2856）

**作業リポジトリ**: `../mulmoclaude`（`@mulmoclaude/core`）。**MulmoTerminal のコードは 1 行も変わらない。**

---

## いま何が済んでいるか（前提。やり直さないこと）

**「済み」は「`../mulmoclaude` の main、または `../mulmoserver` の main にマージ済み」を意味する。**

| 実装順 | 何が | どこに |
|---|---|---|
| 1 | **`CollectionKey`**（`(root, slug)` / `(aid, cid)` の判別共用体）と、それで鍵を持つ change payload・完了ベル id | mulmoclaude #2855 |
| 2 | **Firestore ルール**（`apps/{aid}` 階層、members 認可、投稿制約、mail キュー）+ **emulator テスト** | mulmoserver #155 |
| 3 | **`appManifest.ts`**（`<root>/app.json` から `aid`）と **`firestoreStore.ts`**（`apps/{aid}/collections/{cid}/items`） | mulmoclaude #2856、core **3.6.0** |

**ルールは emulator で実行して検証済み。** `../mulmoserver/firestore.rules` が正で、
親プラン本文のルールのコードブロックは**動かない初稿**（1 リクエスト 1000 式の評価上限に
達して 1 つも実行できなかった）。参照しないこと。

既にあるもので publish が使うもの:

```ts
// @mulmoclaude/core/collection/server
loadAppManifest(root)   // → { ok: true, manifest: { aid } } | { ok: false, kind, detail }
APP_MANIFEST_FILE       // "app.json"
sharedCollectionKey(aid, cid)   // 名前の許容文字の単一の出所（SAFE_SLUG_PATTERN）
// @mulmoclaude/core/collection
validateCollectionRecords / recordFieldProblem   // 事前検証（下記）
```

> **`appManifest.ts` は `aid` しか読まない。** これは意図的で、
> 「ここに足すキーは、publish とこのローダが食い違いうるキー」だから。
> **`members` / `public` を読むのは publish の仕事**であり、**このステップで足すのは
> publish 側**。`appManifest.ts` を拡張して両方から読む形にしないこと。

---

## このステップで作るもの

**リポジトリにコミットされた宣言を、ルールが読める形に落として Firestore に書く。**

```
<root>/app.json                    → apps/{aid}
<root>/.claude/skills/<cid>/schema.json → apps/{aid}/collections/{cid}
（公開設定の一部）                  → apps/{aid}/config/{docId}
```

**publish は「コンパイル段階」である**（親プラン D4）。git の宣言は人間が読み書きする形、
Firestore の `apps/{aid}` は**ルールが読める射影**。両者は別物で、変換は publish に
**すべて**書く。暗黙の変換が 1 つでもあると「サンプルどおりに書いたのに動かない」が再発する。

**publish はこのシステムで唯一の危険な操作である**（親プラン参照）。PR をマージしても誰の
画面も変わらないが、publish した瞬間に全員が変わる。しかも 2 つの意味で:
破壊的スキーマ変更で生きたレコードが不整合になり、**ビューは HTML なので publish 権限は
実質「全メンバーのブラウザで JS を実行する権限」**。

---

## ルールが app ドキュメントから実際に読むフィールド（= publish が出すべきもの）

マージ済み `firestore.rules` から機械的に洗い出したもの。**これが正解表**であり、
親プラン本文の記述と食い違ったらこちらが正しい。

### `apps/{aid}`（ルート）

| フィールド | 必須 | ルールでの使われ方 |
|---|---|---|
| `owner` | **必須** | create 時 `== request.auth.uid`、update 時に不変であること |
| `members` | **必須** | `{ email: { "*" \| cid: role } }`。`listed()` / `role()` の出所 |
| `memberEmails` | **必須（導出）** | `members.keys().toSet()` と一致しないと**書き込みが拒否される**。人が書くものではない |
| `collections` | 任意 | `{ [cid]: { statusField, transitions, immutable, submitOnly, peerVisibility, revealGated, gatedFrom, revealBy, mail } }` |
| `public` | 任意 | `{ enabled, read: {cid: true}, submit: {cid: {...}} }` |
| `participantRead` | 任意 | `{ [cid]: true }` — participant が全件読めるコレクション |

### `collections[cid]`（ルールが見るのはここ。スキーマ本体ではない）

`statusField` / `transitions`（`{initial: [...], <状態>: [...]}`）/ `immutable` /
`submitOnly` / `peerVisibility` / `revealGated` / `gatedFrom` / `revealBy` /
`mail`（`{ toField, on: { <template>: { from: [...], to } }, dataFields }`）

### `public.submit[cid]`

`auth` / `emailField` / `createFields` / `initialStatus` / `idFrom` / `idField` /
`validate`（`{ required: [...], keyFields: [{field, values}] }`、**keyFields は最大 2**）/
`window`（`{ fromMs, untilMs }` — **数値**）/ `selfUpdate`（**状態別**）/ `selfTransitions` /
`finalize` / `audience` / `gateOn`（`{ phase, match }`）

---

## authored → published 変換表（**ここに全部書く**）

| authored（git） | published（Firestore） | なぜ変わるか |
|---|---|---|
| `window.from` / `window.until`（ISO 文字列） | **`window.fromMs` / `window.untilMs`（数値）** | **ルールは文字列を timestamp に変換しない。** ISO 文字列と `request.time` を比較すると型エラーで **fail closed** する（＝「なぜか投稿できない」になる） |
| 各コレクションの `schema.json` | `publishedSchema` + **`collections[cid]`**（平たい形） | ルールが読める形に落とす |
| `actions[].then.email` | `collections[cid].mail` | ルールが宣言を再導出できる形に |
| `actions[].require` + `set`（＋ `selfTransitions`） | `collections[cid].statusField` + `collections[cid].transitions` | 状態機械を**誰に対しても、create にも**効かせる。`statusField` はコレクション設定が**単一の出所** |
| `members` | `members` + **`memberEmails`（導出）** | 「自分が参加しているアプリ」を `array-contains` で引くための非正規化。**ずれると書き込み自体が拒否される** |
| フィールド定義（型・required・enum） | `public.submit[cid].validate` | ルールには反復が無いので、検査できる部分集合だけ |
| — | `publishedCommit` / `publishedBy` / `publishedAt` / `previousPublished` | 記名と rollback |

---

## publish が拒否しなければならないもの（不変条件）

**リンターではなく publish が拒否する。** 理由はルール本体と同じで、
**リンターは作者の手元でしか走らない**。publish は Firestore に何が載るかを決める
唯一の関門なので、保証はここに置く。

1. **`submitOnly` の要求** — `public.submit[cid]` が**レコードを投稿者の身元に束縛している**なら
   （`idFrom: "auth.uid"` / `"auth.uid+field"` / `emailField` / `audience: "participant"` の
   いずれかがある）、その `collections[cid]` は `submitOnly: true` を宣言していなければならない。
   **`audience` の有無を条件にしないこと**（親プラン「`audience` は投稿経路しか縛らない」）。
   `immutable` を条件にするのも誤り — S2 の回答は immutable ではないが同じように水増しできる
2. **`aggregate.by` ⊆ `validate.keyFields` ∪ `gateOn.match` ∪ `statusField`** —
   集計キーが未検査だと、公開された集計が汚染される
3. **`auth` は `"verifiedEmail"` のみ**（オーナー判断）。`"none"` / `"anonymous"` を書いた
   アプリは拒否する。**ルールは 3 段階すべてを表現できる状態のままにする** — 段階を
   ルールから削ると、商売判断が変わったときに cross-repo デプロイをやり直すことになる
4. **名前** — `aid` / `cid` は `sharedCollectionKey()` を通す（`SAFE_SLUG_PATTERN`）。
   独自の検証規則を書かないこと
5. **`mail.on[t].from` と `to` が素であること** — 重なっていると同じ遷移で二重に送れる
6. **`window` は変換後に数値であること**、`untilMs > fromMs`
7. **`keyFields` は最大 2**（ルールに反復が無いので明示的に展開してある）

## publish が壊しうるもの（事前検証とゲート）

- **ライブデータの検証** — `validateCollectionRecords` / `recordFieldProblem` で
  「新スキーマで既存レコードが何件壊れるか」を出し、**0 件でなければ確認を挟む**。
  publish がそのままマイグレーションのゲートになる
- **記名** — 誰が・どのコミットを・いつ。**前版を残して rollback 可能に**
- **CI からの publish は当面やらない。** owner ロールを持つサービスアカウントが要り
  principal の種類が増えるので、**最初は手動 + コミットスタンプ**

---

## ルールが課す手続き上の制約（実装前に読むこと）

- **`apps/{aid}` の create は「自分を owner と名乗る」こと**を要求する:
  `verified()` かつ `owner == request.auth.uid` かつ `members[自分]["*"] == "owner"`
  かつ `memberEmails` が `members` と一致
- **update は `role(app,'*') == "owner"` かつ `owner` が不変**
- **`collections/{cid}` の write は owner のみ**（= これが publish）
- **`apps/{aid}` の delete はクライアントから不可**（`allow delete: if false`）。
  Firestore はカスケードしないので、消すと子が孤児になり、空いた `aid` を拾った他人が
  owner になれる。アプリの削除は再帰削除に属する（親プラン「アプリの削除（再帰削除）— 手順」）
- **publish は「作成」と「更新」で通る条件が違う。** 初回だけ owner を名乗る必要があり、
  2 回目以降は owner が不変であることを要求される。**両方をテストすること**

---

## 決めること（着手する人が判断する。必要ならオーナーに聞く）

- **`app.json` の authored な形**（`members` / `public` / `collections` をどう書くか）。
  親プランのサンプル節（S1〜S4）が実質の仕様。**JSON ブロックは機械検証済み**なので
  そこから起こすのが早い
- **`publishedSchema` に何を入れるか** — スキーマ全部か、ビューが要る部分だけか。
  ルールは読まないので純粋にホスト都合
- **`config/{docId}` に何を出すか** — `allow read: if true` の公開設定。**名簿を含めない**
  （participant に同級生のメールが見えるのを防ぐために `apps/{aid}` の read を絞ってある）
- **どこから起動するか** — エージェントのツール（`manageCollection` 系）か、UI か、CLI か
- **前版の保持形式** — `previousPublished` に何を入れるか（全文か、コミット参照か）

---

## 検証

**API キー無し・ネットワーク無しで走らなければならない。** #2856 が
`FirestoreDocs` の継ぎ目にインメモリ fake を注入する形を確立しているので、それを使う。

- **変換のテスト** — authored な `app.json` を入れて、published なドキュメントが
  上の表どおりになること。**特に `window` の ISO → epoch millis**。
  文字列が残っていたらそれは fail closed のバグ
- **`memberEmails` のテスト** — `members` から必ず導出され、手で書いた値は上書きされること
- **不変条件のテスト** — 上の 7 つそれぞれについて、**拒否されるケースと通るケースの両方**。
  拒否だけ書くと「全部拒否している」実装が通る
- **事前検証のテスト** — 既存レコードが新スキーマで壊れるとき、publish が止まること
- **べき等性** — 同じ入力で 2 回 publish して、2 回目が壊さないこと（`previousPublished` の
  連鎖が無限に伸びない、`publishedAt` 以外が同じ）
- **ルールとの往復（推奨）** — `../mulmoserver` の emulator ハーネス（`yarn test:rules`、
  `test/rules/`）に、**publish が出した実物のドキュメントを流し込む**テストを 1 本足すと、
  変換表とルールの食い違いがその場で出る。**これは「読んで正しい」では代替できない**
  （実装順 2 で、4 巡の静的レビューを通ったルールが 1 つも実行できなかった）

コマンド。**どのディレクトリで走らせるかで別のスイートが走る**:

```bash
cd <mulmoclaude>/packages/core && yarn test && yarn typecheck && yarn lint && yarn build
cd <mulmoclaude> && yarn test
cd <mulmoclaude> && yarn run test:coverage     # yarn test が通っても落ちうる（glob とプロセス分離が違う）
cd <mulmoclaude> && yarn run check:launcher-sync             # core の version を上げたら
cd <mulmoclaude> && node scripts/packages/check-changelog-ships.mjs   # 同上
```

バージョンゲートの直し方: `check:launcher-sync` は `packages/mulmoclaude/package.json` と
`packages/plugins/google-plugin/package.json` の core レンジ。`check-changelog-ships.mjs` は
`docs/CHANGELOG.md` の **`[Unreleased]` の `Ships` 行**（**公開済みのバージョン節は書き換えない**）。

## 範囲外

- discovery の 2 ソース化・skill materialize（実装順 4）
- `onSnapshot` によるライブ更新（実装順 6）
- `worktreeEnv` による `aid` の分岐（実装順 7）
- 招待 UI / メンバー管理（実装順 8）— **publish は名簿を書くが、名簿を編集する UI は別**
- スキーマリンター本体（実装順 18）— publish が拒否する不変条件とは別物

## 落とし穴（このプランで実際に起きたもの）

- **静的レビューは「読む限り正しく見える」を止められない。** 実装順 2 のルールは
  4 巡の静的レビューを通り、それでも 1 つも実行できなかった。**動かして確かめること**
- **層ごとに独自の検証規則を書かないこと。** 名前の規則は `isValidCollectionName` が
  単一の出所。独自規則は、片方だけ通って catch に飲まれ、機能が静かに止まる
- **拒否のテストには必ず対になる成功ケースを書くこと。** 無いと「全部壊れている」実装が
  「安全」に見える
- **未マージの PR を前提にしないこと。** このファイルの「済み」は main にマージ済みの意味
