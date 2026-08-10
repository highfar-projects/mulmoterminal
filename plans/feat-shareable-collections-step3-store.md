# feat: 共有コレクション — 実装順 3「store を `(aid, cid)` で書き直す」

**Status**: 未着手（このファイルは着手する人への引き継ぎ）
**日付**: 2026-08-10
**親プラン**: [`plans/feat-shareable-collections.md`](./feat-shareable-collections.md) — **先に読むこと。**
このファイルは親プランを前提に、ステップ 3 だけを切り出したもの。

**作業リポジトリ**: `../mulmoclaude`（`@mulmoclaude/core`）。**MulmoTerminal のコードは 1 行も変わらない。**
MT 側の作業は実装順 4 以降で、core の publish が前提になる。

---

## いま何が済んでいるか（前提。やり直さないこと）

| | 何が | どこに |
|---|---|---|
| 実装順 1 | **`CollectionKey`**（`(root, slug)` と `(aid, cid)` の判別共用体）と、それで鍵を持つ change payload / 完了ベル id | mulmoclaude #2855 **マージ済み**、core **3.5.0** |
| 実装順 2 | **Firestore ルール**（`apps/{aid}` 階層、members による認可、投稿制約、mail キュー）と **emulator ユニットテスト** | mulmoserver #155 **マージ済み** |

**ルールは動作確認済みである。** 静的レビュー 4 巡が通していたルールは、実際には
1 リクエスト 1000 式の評価上限に達して**1 つも実行できなかった**。現在のルールは
emulator で実行されたもので、`../mulmoserver/firestore.rules` が正。
親プラン本文のルールのコードブロックは**動かない初稿**なので参照しないこと。

### core が既に提供しているもの（`@mulmoclaude/core/collection` / `/collection/server`）

```ts
type CollectionKey = { kind: "local"; root: string; slug: string }
                  | { kind: "shared"; aid: string; cid: string };

sharedCollectionKey(aid, cid)      // 検証つきコンストラクタ。名前は SAFE_SLUG_PATTERN
localCollectionKey(root, slug)     // server 側。root を canonicalRoot で正規化する
collectionKeyName(key)             // slug または cid。**同一性ではない**（スコープ内の索引用）
collectionKeyId(key) / parseCollectionKeyId(s) / sameCollectionKey(a, b)
isValidCollectionName(value)       // 鍵を経由しない符号化器が同じ規則を使うための述語

// 変更通知
sharedCollectionChangePayload(base, aid)   // shared 用。root は絶対に付かない
collectionChangePayload(base, root)        // local 用。aid を受け付けない（型で排他）
collectionChangeKey(payload, fallbackRoot) // 「フィールドが無いことの意味」を決める唯一の場所
```

**この型が名前の許容文字の単一の出所である。** 下流の符号化（完了ベル id、pubsub
チャンネル名）は独自の規則を持たないこと — 層が食い違うと、片方だけ通って
publisher の catch に飲まれ、**ライブ更新が理由も告げずに止まる**（実際に起きた）。

---

## このステップで作るもの

**`storage: { type: "firestore" }` を宣言したコレクションのレコードを、
`apps/{aid}/collections/{cid}/items/{id}` に読み書きする `CollectionStore` 実装。**

- **スキーマとビューは git**、**レコードだけ Firestore**（親プラン D3）
- コレクションの同一性は `(aid, cid)`。`cid` はコレクションの slug、`aid` は
  **アプリ（= リポジトリ）単位**の id
- `onSnapshot` によるライブ更新は**このステップではやらない**（実装順 6）。
  今は「変更を報告できない store」として watcher の clock tick に拾わせる
- publish（git → Firestore）も**やらない**（実装順 5）

---

## 出発点: ドラフト PR mulmoclaude #2209

`feat/firestore-collection-backend`（2026-07-28、25 ファイル +1571 −50）。
**そのままマージしてはいけない**が、機構は 1 つも捨てるところがない。

### そのまま使える（パスに依存しない設計）

| ファイル | 何が使えるか |
|---|---|
| `packages/core/src/collection/server/firestoreDocs.ts` | **SDK との継ぎ目**。`collectionPath` は引数なので `(aid, cid)` 化の影響ゼロ。`orderBy("__name__")`（ドキュメント id 順）にする理由 — フィールド順だと**そのフィールドを持たない文書が黙って落ちて部分読み取りになる** — と、`create` が原子的で「2 つの並行 create が両方 missing を観測する」を防ぐこと |
| `firestoreStore.ts` の本体 | レコード変換の fail-soft、`safeRecordId` を他バックエンドと共有する理由（可搬性・ファイルへの書き戻し）、**「未接続」と「0 件」を絶対に混同させない**可用性方針（factory は throw せず各メソッドが実行可能な文言で失敗する）、`query` を持たない理由付け |
| `collection-watchers/watcher.ts` の追加分 | `cannotReportChanges()` が「バックエンドではなく**能力**を問う」形。実装順 6 で `watch` が生えれば**このファイルを触らずに**特別扱いが消える |
| `collection/server/discovery.ts` の `acceptStorageSchema()` 抽出 | 「ファイル backed だけが `storageFile` を解決・containment 検査する」構造 |
| `collection/server/host.ts` の accessor 分離 | `setFirestoreAccessor` を `configureCollectionHost` と分ける理由（セッションは起動時に存在せず、切断で消えるので一発の binding に入れられない） |
| テスト 3 本（store contract / watcher / manageCollection） | インメモリ fake を継ぎ目に注入する形。パスとハンドルの組み立てだけ直せば効く |

### 書き換えるもの

| 箇所 | #2209 | このステップ |
|---|---|---|
| パス | `users/{uid}/collections/{slug}/items` | **`apps/{aid}/collections/{cid}/items`** |
| 同一性の出所 | uid は**ライブセッションから。スキーマからは絶対に取らない** | **`aid` はリポジトリにコミットされる**（意図的） |
| 安全論拠 | 「スキーマ由来のパスは rules の守備範囲外を指せる」 | **members による認可**（マージ済みルール） |
| 削除の拒否文言 | 「孤児になるので拒否」 | 理由は同じだが出口がある（オーナーの再帰削除、親プラン参照） |

> **最大の作業はコードではなく理由の書き換えである。** #2209 の安全論拠は
> `firestoreStore.ts` / `host.ts` / `schemaZ.ts` / `discovery.ts` のコメント全部に
> 埋まっている。パスの計算は 1 行だが、**「パスを指定させないことで守る」から
> 「名簿で認可する」への入れ替えは全ファイルに及ぶ。** 古い論拠を残したまま
> パスだけ変えると、次に読む人は嘘を読むことになる。

---

## 決まっていること（蒸し返さない）

1. **`aid` はアプリ（リポジトリ）単位であって、コレクション単位ではない。**
   したがって `StorageZ` の firestore バリアントは `{ type: "firestore" }` のままでよく、
   `aid` を per-collection スキーマに載せない。親プラン D1「共有の単位はアプリ」の帰結
2. **`.strict()` を firestore バリアントに付ける**（#2209 の判断を維持）。
   このバリアントはパスを取らないので、`path` を書いた人の誤解を黙って通してはいけない。
   sqlite 側は既存スキーマを壊さないため permissive のまま
3. **`safeRecordId` は他バックエンドと共有する。** Firestore はもっと緩い id を通すが、
   レコードはバックエンド間で可搬でなければならない
4. **`query` は持たない。** 集計はエンジン側の `runCollectionQuery` が答える
5. **「未接続」を空の結果に縮退させない。** 沈黙は「レコードが無い」と区別できず、
   データ消失に見える

## 決めること（着手する人が判断する。必要ならオーナーに聞く）

- **`aid` をどこから読むか。** リポジトリにコミットされた宣言（`app.json` 相当）を
  想定しているが、その置き場とローダは**まだ存在しない**。このステップで最小の
  ローダを作るのか、ホストが binding で渡すのかを決める。
  **`aid` を schema に載せる案は却下済み**（上記 1）
- **`uid` はもう要らないのか。** 認証（誰として読み書きするか）には依然セッションが要る。
  `FirestoreHandle` から `uid` を落とすのか、認可には使わないが保持するのかを決める
- **`cid` は slug と常に同じか。** 親プランは同じ前提で書かれているが、明示的に固定して
  テストで縛ること（`collectionKeyName` を「索引用であって同一性ではない」と扱う規律）

---

## 検証

**この repo のテストは API キー無し・ネットワーク無しで走らなければならない。**
`FirestoreDocs` の継ぎ目にインメモリ fake を注入する #2209 の形をそのまま使う。

- **store contract テスト** — fake に対して list / get / set / create / delete の
  ラウンドトリップ。`create` が既存 id に対して false を返すこと（原子性の契約）
- **パスのテスト** — `(aid, cid)` から組み立てたパスが
  `apps/<aid>/collections/<cid>/items` であること。**`aid` や `cid` に不正な名前が来たら
  `sharedCollectionKey` が投げること**（鍵を経由しない組み立てを作らない）
- **可用性のテスト** — セッション無しで各メソッドが「未接続」で失敗し、
  **空配列を返さない**こと
- **変更通知のテスト** — 書き込みが `sharedCollectionChangePayload` を発行し、
  `collectionChangeKey` が `{kind:"shared", aid, cid}` を返すこと。
  **root が絶対に載らないこと**（このペイロードはブラウザ、さらにビュー経由で
  LLM 生成の iframe に届く）
- **ルールとの整合** — このステップはルールを変えない。もしルール変更が要ると思ったら、
  それは設計が親プランから外れた合図。**先に立ち止まって確認すること**
  （ルールは cross-repo のデプロイで、凍結インフラ）

コマンド: `cd ../mulmoclaude/packages/core && yarn test && yarn typecheck && yarn lint && yarn build`、
ルートで `yarn test`。core の version を上げたら
`yarn run check:launcher-sync` と `node scripts/packages/check-changelog-ships.mjs` も通すこと
（**両方とも CI のゲートで、バージョンを上げただけで落ちる**）。

## 範囲外

- `onSnapshot` によるライブ更新（実装順 6）
- publish（git → Firestore。実装順 5）
- discovery の 2 ソース化・skill materialize（実装順 4）
- 招待 UI / メンバー管理（実装順 8）
- MulmoTerminal 側の配線（core の publish 後）

## 落とし穴（このプランの過去の巡回で実際に起きたもの）

- **静的レビューは「読む限り正しく見える」を止められない。** 実装順 2 のルールは
  4 巡の静的レビューを通り、それでも実行できなかった。**動かして確かめること**
- **`assertFails` / エラーは「安全」の証拠にならない。** 評価エラーでも fail する。
  すべての拒否に**対になる成功ケース**を書くこと。無いと「全員に対して壊れている」が
  「安全」と読める
- **層ごとに独自の検証規則を書かないこと。** 名前の規則は `isValidCollectionName` が
  単一の出所。独自規則は、片方だけ通って catch に飲まれ、静かに機能が止まる
