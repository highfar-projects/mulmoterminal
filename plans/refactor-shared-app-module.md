# 共有アプリのコンパイラを `receptron/sharedapp` に出す

**状態**: 提案（2026-08-13）。実装は未着手。
[`refactor-shared-app-wire-contract.md`](./refactor-shared-app-wire-contract.md) の**決定 1 を
差し替える**もの（あちらは射影の書き込み側だけを MT に引き取る案で、実装まで行ったが
**保留にした** — mulmoclaude#2892 / mulmoterminal#1672 / mulmoserver#174 は draft）。
ゴールデン文書（決定 2・3）はそのまま生きる。
前提は [`docs/shared-app-principles.md`](../docs/shared-app-principles.md)、
決定は [`feat-shareable-collections.md`](./feat-shareable-collections.md) の D1–D10。

---

## 何が問題か

**共有アプリの作業をするたびに MulmoClaude をリリースしている。**

過去 90 日で core の共有アプリスタック
（`publishManifest` / `publishProject` / `publishChecks` / `appViews`）に入った
コミットは **24 本**。中身はほぼ全部が共有アプリそのものの作業で、
**その全部が「core を直す → CI → マージ → 人手の npm publish → MT で bump」を通った**。

```
feat(collections): アプリのページを監査対象ごとに宣言できるようにする
feat(collections): 行スコープの assignee ロールと、先着枠のための宣言を追加
feat(collections): app.json が URL 名（slug）を宣言できるようにする
feat(collections): 枠の排他と、公開ページのビューを宣言できるようにする
fix (collections): publish が実際に promote する設定を検査する
… 全 24 本
```

一番よく通るのは `AuthoredAppZ` — **`app.json` にキーを 1 つ増やすたびに core リリース**。
`publishChecks.ts` は 90 日で 13 コミット、`publishProject.ts` は 16 コミット。

前案（決定 1）が外せたのはこのうち 5 本程度で、上の 3 つはどれも残っていた。
**細い 1 本ではなく、スタックごと出す。**

## 先に確かめたこと

**MulmoClaude はこのスタックを 1 行も使っていない。**
`src/` `server/` を `AuthoredApp` / `projectApp` / `publishProblems` / `AppManifest` で
grep して **0 件**。core の中でも、この 4 ファイルを import しているのは
バレル（`index.ts`）だけ（`publishChecks` → `publishProject` の内部 import を除く）。

**共有アプリのパス定数も core の他の場所からは使われていない。**
`APPS_COLLECTION` / `appStagingPath` / `appConfigPath` / `appSchemasPath` /
`appSlugDoc` / `appViewTierPath` / `viewDocId` / `viewConfigDocId` /
`PUBLIC_CONFIG_DOC` を core 全体で grep すると、`publishProject.ts` /
`appViews.ts` / `index.ts` 以外に出現しない。
**したがって core → 新モジュールの依存は要らない。** 向きは一方通行になる。

**MT が `collection/server` から使っている 73 シンボルは、きれいに 2 つに割れる。**
33 が共有アプリのコンパイラ、40 が**コレクションのランタイム**
（`configureCollectionHost`、`discoverCollections`、`storeFor`、`firestoreHandle`、
`validateCollectionRecords`、`makeManageCollectionTool` …）。後者は MulmoClaude も使う。

**mulmoserver が値として import している core のシンボルは 2 つだけ。**
`test/rules/rules_publish.ts` の `AuthoredAppZ` と `projectApp`。
他は全部 `import type`（`remote-view` / `remote-host`）でビルド時に消える。

---

## 決定 1. 出すのは**コンパイラ**。ランタイムは core に残る

線は「宣言 → Firestore の文書」に引く。

**`receptron/sharedapp` に出す**

| ファイル | 行数 | 中身 |
| --- | --- | --- |
| `publishManifest.ts` | 416 | `AuthoredAppZ` — `app.json` が何を宣言できるか |
| `appViews.ts` | 232 | `views[]` の正規化、参加者の読みスコープ、文書 id |
| `publishProject.ts` | 551 | `projectApp` / `projectDeploy` / `projectPublish` / `projectSubmit`、パス定数 |
| `publishChecks.ts` | 1002 | publish が何を拒否するか |
| （MT の `appViewProjection.ts`） | 349 | 階層ごとの射影。前案で MT に移したもの |

**core に残る** — コレクションのランタイム全部（`host` / `store` / `discovery` /
`firestoreStore` / `collection-watchers` / `registry`）、`appManifest.ts`
（`discovery.ts` が使う。90 日で **1 コミット**）、および
`collectionKey` / `templatePath` / `schema`（core の他の場所に用途があり、動かない）。

## 決定 2. 依存の向きは一方通行。モジュール → core は**動かない側だけ**

新モジュールが core から使うのは 3 つだけ:

- `isValidCollectionName`（`collection/core/collectionKey`）
- `isSafeCustomViewPath`（`collection/core/templatePath`）
- `CollectionSchema` / `CollectionFieldSpec`（型のみ）

**これらを持ってこないこと。** どれも core の他の場所（`schemaZ`、`reconciler`、
`skill-bridge`）が使っていて、持ってくると core → モジュール → core になる。
複製もしない — 同じ検証が 2 つあるのは、まさに逃げたい種類の食い違い。

**モジュールが core に依存しても目的は達成される。** 目的は
「共有アプリの作業で MulmoClaude をリリースしない」であって「依存をゼロにする」ではない。
モジュールは core を古いバージョンで固定したまま、`app.json` にキーを足し続けられる。

`@mulmoclaude/common` の `isRecord` は 1 行なので、モジュール内に置いて依存を 1 つ減らす。

## 決定 3. 配布は **git ref**。npm を通さない

```json
"receptron/sharedapp": "github:receptron/sharedapp#<sha>"
```

npm を通すと、逃げたはずの**人手の publish ゲートが戻ってくる**。
**mulmoclaude の monorepo には置かない**（同じ理由でリリースを相続する）。
**MT のモノレポ化もしない** — mulmoserver が `github:receptron/mulmoterminal#sha` を
引くと、MT の CLI 全体が MS の dev ツリーに入る。

名前に `mulmo` スコープを付けない。MulmoClaude のものではないことを名前で示す。

**スパイク済み（2026-08-13）— 両方で通った。**
`zod` を持つ最小モジュールをローカル git リポジトリにして、`prepare: tsc` を置き、
`git+file://…#<sha>` で両リポジトリに install した。

| | MulmoTerminal（yarn 1.22） | mulmoserver（vite + vue-tsc） |
| --- | --- | --- |
| install で `prepare` が走り `dist` が出る | 通る | 通る |
| `--frozen-lockfile` でも `prepare` が走る | — | 通る（`Building fresh packages...`） |
| 型が越える（`z.infer` 込み） | `vue-tsc -b` 通る | `tsc -p test/tsconfig.json` 通る |
| 実行できる | vitest / tsx 通る | `node:test`（tsx）通る |
| 本番ビルド | `vite build` 通る | `vue-tsc && vite build` 通る |
| 推移的依存（`zod`）が解決される | 通る | 通る |

lockfile には
`"sharedapp@git+file://…#<sha>": resolved "…#<sha>"` と sha 付きで固定される。
`files: ["dist"]` で `dist` だけが配られることも確認した。

**残る 1 点**: 検証は `git+file://` で行った。CI が `github:receptron/sharedapp#sha` を
引く場合、**repo が private だと認証情報が要る**（公開なら不要）。ここは repo を
作るときに決める。

## 決定 4. ゴールデン文書は残す。ただし役割が変わる

[前案の決定 2・3](./refactor-shared-app-wire-contract.md) で作った
`test/fixtures/sharedAppGolden/` は残す。**ただし mulmoserver は射影器を直接呼べる
ようになる**ので、mulmoserver 側は「文書を読む」形に固定しなくてよくなり、
**#1673 の手コピー問題は消える**。

- MT: ゴールデンを再生成して diff（**残す** — 文書の形が変わったことを diff で見せる装置は、
  依存の有無と関係なく有用）
- mulmoserver: `projectAppViews` をモジュールから呼んで `writeOf` / `capabilitiesFor` に
  食わせる（**#173 の元の形に戻す**）
- mulmoserver `rules_publish.ts`: `projectApp` をモジュールから呼ぶ。**今のまま**

---

## リポジトリ横断と依存順

0. **[済] スパイク**: `git+file://` の最小モジュールで、MT と MS の両方の
   install / typecheck / test / build が通ることを確認した（決定 3 の表）。
   残るのは repo を private にするかどうかだけ。
1. **sharedapp**: 4 ファイル + MT の `appViewProjection.ts` を入れ、テストを移す
   （core の `test_appViews.ts` / `test_publishChecks.ts` などの該当分）。
2. **core**: 移した分を削り、`index.ts` から外す。`test_sharedHostSurface.ts` は
   「ホストが戻ってこなくて済むか」を測る装置なので、**共有アプリの分が丸ごと減るのが正しい**。
   `@mulmoclaude/core` **4.0.0**（1 回だけのメジャー）。
   同梱プラグイン 7 本の peer が `^3.6.0` なので、**7 本とも major を上げて publish する**
   （mulmoclaude#2892 で判明。レンジを直すだけでは足りない — npm に出ている版が
   `^3.6.0` と言っている以上、strict な peer 解決が新規 install を拒み得る）。
3. **MT**: import を `@mulmoclaude/core/collection/server` から `sharedapp` に付け替える
   （33 シンボル）。`appViewProjection.ts` を消してモジュールを指す。
4. **mulmoserver**: `rules_publish.ts` と `test_appViewRoundTrip.ts` を `sharedapp` に向ける。

2 と 3 は **1 回の core リリース**を使う（前案と同じ「削るための最後の publish」）。
以後、`app.json` のキーも publish ゲートも `{tier}/config` も、**core のリリース無しで動く**。

## やらないこと

- **ランタイムは動かさない。** `host.ts` / `store.ts` / `discovery.ts` /
  `firestoreStore.ts` / `firestoreDocs.ts` は MulmoClaude も使う汎用のコレクション機構。
- **`appManifest.ts` は動かさない。** `discovery.ts` が使っていて、churn しない。
- **`collectionKey` / `templatePath` / `schema` は動かさない・複製しない**（決定 2）。
- **mulmoserver → MulmoTerminal の依存は作らない。**
- **MulmoClaude アプリ（`src/` / `server/`）には何も足さない・引かない。**
  変わるのは同居している `packages/core` だけ。
- **MT の core 依存全体を減らそうとしない。** MT は core の 21 サブパス
  （wiki / scheduler / google / feeds / notifier / remote-host …）に乗っていて、
  それは意図した設計。この計画が外すのは共有アプリの分だけ。

## 開いている問い

- **`receptron/sharedapp` を public にするか private にするか。** private なら
  両リポジトリの CI に GitHub の認証情報が要る（`git+ssh` かトークン）。
  public なら何も要らない。中身は共有アプリの宣言スキーマとコンパイラで、
  秘密は含まない。
- **`sharedapp` 自体のバージョニング**: sha 固定か tag か。tag だと「リリース」が
  復活しかねない。
- **`sharedapp` の CI**: core のテストを移すので node:test をそのまま使えるが、
  MT（vitest）と MS（node:test）のどちらの流儀に寄せるか。
- **`PublishStamp` の置き場所**。今は `publishProject.ts` にあり、MT の deploy/publish が
  作って渡す。モジュールの入口の型なので一緒に出るが、MT 側の型と重ならないか確認する。
