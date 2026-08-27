# 公開のトップページをアプリに返す

共有アプリが記事を出せるようになった（`plans/feat-shared-app-articles.md`）。そのとき
`views[].type: "article"` に**住所を 2 つ**渡してしまった。この計画はその 1 本を返す。

## いま起きていること

| 住所 | いま描くもの | 誰のものであるべきか |
|---|---|---|
| `/a/{slug}` | プラットフォームの索引 | **アプリ** |
| `/a/{slug}/{id}` | プラットフォームの記事ページ | プラットフォーム |

`appViews.ts` の `viewSourceProblems` は **`path` と `type` の同時宣言を断る** — 「a view is
either HTML you wrote or a page the platform draws, and publishing would have to choose one
silently」。そして `viewAudienceProblems`（同 243）は public ビューをアプリに 1 つしか許さない。
2 つ合わせると、**記事を出すアプリは公開の顔を丸ごと手放す**。表紙も、About も、セクションの
ナビも、刊行物としての体裁も置けない。プラットフォーム上の記事アプリは全部おなじページになる。

断り文句の *「publishing would have to choose one silently」* が真なのは、`type` が**両方の
住所を取っているから**でしかない。前提のほうが動く。

## 2 つの半分は等価ではない

**記事ページはプラットフォームのもの**である。markdown は sandbox の外・この origin で
`v-html` されるので、`mulmoserver/src/utils/articleMarkdown.ts`（`marked` → `DOMPurify`、生 HTML は
パーサで落とし、`class` は剥がす）が**セキュリティ境界そのもの**になっている。手書きページに
渡せる代物ではない。サインアウトで描けて共有できる URL でもある。

**索引はそうではない。** ただのレコードの一覧で、手書きの公開ページは**同じ datasets を
すでに受け取っている**。プラットフォームが持つ理由がない。

## 決めたこと

### D1 プラットフォームは索引を描くのをやめる

`/a/{slug}` は**常に**アプリの HTML。`PublicArticles.vue` の索引の枝は消える。記事ページと
「その id の記事は無い」の枝だけが残る。

### D2 `views[].type` は語彙から消し、`article` ブロック単独が宣言になる

```json
{ "id": "public", "audience": "public",
  "path": "views/home.html",
  "collections": ["articles"],
  "article": { "title": "title", "body": "body", "byline": "byline" } }
```

`article` があること＝**このコレクションのレコードは `/a/{slug}/{id}` で markdown として
描かれる**。`type` は「何がこのページを描くか」を言う鍵だったが、描くのは `path` に戻るので
言うことが無くなる。今日の `article` without `type` の拒否（`appViews.ts:190`）は**逆になる**。

`type` は残さず消す。ただし **`.strict()` の "Unrecognized key" ではなく、名指しの拒否**を出す:
`type` を消して `path` を足せ、と著者の言葉で言う。

### D3 `path` はすべてのビューで必須

`viewSourceProblems` は「`path` か `type` のどちらか片方」から「`path` が要る」に縮む。
記事だけ出したいアプリも索引 HTML を書く — それがこの計画の払う代金であり、目的でもある。

### D4 protocol はバンプしない

`protocolFor` は `type` の代わりに `article` を見る。記事アプリは 2.0.0 のまま、それ以外は
1.0.0 のまま。

**古い reader がこの形をどう読むか**は数えてある: `path` は 1.0.0 から知っている鍵なので、
**アプリ自身の HTML を描く**。知らないのは `article` だけで、その結果は `/a/{slug}/{id}` に
記事が出ないこと — 劣化であって、別のアプリを見せることではない。索引の位置に生成フォームが
出る（＝major を上げた理由）とは種類が違う。

### D5 新しい橋の動詞 `view.open(cid, id)`

フレームは **`sandbox="allow-scripts"` のみ**（`mulmoserver/src/components/AppPageFrame.vue:34`）。
`allow-top-navigation` も `allow-popups` も無く、自己ナビゲーションには backstop がある。
**アプリの表紙から記事ページへリンクが張れない。** これがこの計画の唯一の新語彙。

`href` を親が横取りして解釈する案は採らない。ページが書いた文字列を読んで挙動を決めるのは、
この一族がずっと断ってきた形（mulmoterminal の CLAUDE.md、ランチャーチップの項）である。
**宣言された動詞にする。**

- ページ: `await view.open("articles", "my-slug")`
- 線: `{ type: "mc-public-view:open", cid, id, requestId }`
- 親: `cid` が `article` を宣言したコレクションであることを確かめ、`/a/{slug}/{id}` へ push

**slug はページが名乗らない。** 親が持っている。だからページはこのアプリの外へ人を送れない —
構造で保証される。

### D6 `open` は答えが返る

`{ opened: boolean; reason?: OpenRefusal }`。`unknown-collection` / `invalid-id` /
`no-navigation`。最後のが要るのは、**navigate ポートを持たない親が実在する**から:
MulmoTerminal のプレビューのペイン。ペインは `opened: false` を返し、押されたことを診断ログに
書く（「ページが `articles/my-slug` を開こうとした」）。本番では push が走ってこの文書は
置き換わるので、promise は通常 settle しない — それは**リンクの意味論**であって、契約の穴では
ない。ページはこれを `await` してから何かする書き方をしない。

### D7 この回は public だけ

`/m/{slug}` のデスクから公開記事を開くのは同じ動詞で足りるが、親が別（`AppViewFrame.vue`）
なので別の回にする。

### D8 `theme` は `article` を見る

`themeProblems`（`publishChecks.ts:1673`）は「プラットフォームが描くページが 1 つも無いのに
`theme` がある」を断っている。描くページは記事ページとして残るので、条件を `type` から
`article` に付け替える。

### D9 記事コレクションはアプリに 1 つのまま

`/a/{slug}/{id}` に「どのコレクションか」を書く場所が無い（`appViews.ts:199` の理由）。
2 本目の markdown コレクション（About ページなど）は **URL を 1 段深くする決定**と一緒に、
別の回に。

### D10 既存の 2 本は著者が直す

`~/git/ai/apps/blogs`（`ai-notes`）と `~/git/ai/apps/ai-blogs`（`ai-journal`）は、
`type` を消して `path` に索引ページを足す。互換の受け皿は作らない（依頼どおり）。

## リポジトリごとの作業

**`sharedapp`（先）**

- `publishManifest.ts` — `ViewZ.type` を消す
- `appViews.ts` — `NormalizedView.type` を消す / `viewSourceProblems` を `path` 必須に /
  `type` を名指しで拒否 / `articleCollectionProblems` を `article` で判定
- `appProtocol.ts` — `protocolFor` が `article` を見る
- `publishChecks.ts` — `articleCostProblems` / `articleRefProblems` / `themeProblems` を
  `article` で判定
- `publishProject.ts` — 射影から `type` を落とす
- `view/protocol.ts` — `VIEW_MESSAGE.open` / `openResult`
- `view/message.ts` — `readOpenMessage` / `OpenAsk` / `OpenRefusal` / `OpenAnswer`
- `view/parent.ts` — `navigate` ポート（optional）と、無い親の `no-navigation`
- `view/bridge.ts` — `BridgePorts.navigate`
- `view/srcdoc.ts` — `view.open(cid, id)`

**`mulmoserver`（次）**

- `PublicArticles.vue` — 索引の枝を削除
- `PublicApp.vue` — `/a/{slug}` は常に `AppPageFrame`、`/a/{slug}/{articleId}` が
  `PublicArticles`。`navigate` ポートを渡す
- `publicViewConfig.ts` — `type` を見るのをやめる

**`mulmoterminal`（最後）**

- プレビューのペイン — `open` を受けて診断に書く（`no-navigation` を返す）
- `server/skills/mulmoterminal-shared-app` — 記事アプリの書き方が変わる
- テンプレート `magazine.md` を（改めて）書くならこの形で

## 範囲外

- 2 本目の markdown コレクション（D9）
- member / participant のページからの `open`（D7）
- 記事ページ自体の見た目（`plans/feat-shared-app-articles.md` のまま）
