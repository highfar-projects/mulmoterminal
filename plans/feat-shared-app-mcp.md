# 共有アプリを LLM が「使う」— 汎用の MCP

**状態**: **S0–S2 実装済み**（2026-08-23、`useSharedApp` ツール一式・`yarn test` 全緑）。S3 は未着手。
実装で 3 つの決定が変わった — **M1**（ツールの数）、**M5**（capability の出どころ）、**M10**（グループ）。
どれも下の該当節に「実装で変わった」として書いてある。**ルール変更は無く、既存アプリは再 publish 不要**。
**日付**: 2026-08-23
**前提**: [`docs/shared-app-principles.md`](../docs/shared-app-principles.md)（特に原則 2・3・5・11 と D7）、
[`plans/feat-shared-app-preview-intent.md`](./feat-shared-app-preview-intent.md)（ホストから会員の操作を
実行する既存の 1 本）、[`plans/feat-shared-app-uid-identity.md`](./feat-shared-app-uid-identity.md)（身元）。
**言葉の権威**: `@receptron/sharedapp/view`（`intent.ts` / `capability.ts`）と mulmoserver の
`src/firestore/appWrite.ts`（`performIntent`）・`src/composables/useAppIntent.ts`。

---

## 何を作るか

publish 済みの共有アプリに対して、**人がブラウザでページを開く代わりに LLM が話しかける**ための
MCP。アプリごとのツールではなく、**どのアプリにも同じツールが効く**ものを 1 組だけ作る。

> 「サロンの板で保留中の 2 件を承認して」
> 「3 時の枠を取って」
> 「自分の申込みを取り下げて」
> 「いま何番目？」

書く側の役は 2 つ — **participant**（自分の行を出す・動かす・取り下げる）と
**member**（名簿に載っていて、ロールの範囲で他人の行を動かす）。著者（owner）の道具は既にある
（`manageSharedApp`）ので、これはその反対側である。

## なぜ「汎用」が成り立つのか

3 つとも既にそうなっているだけで、この計画が新しく決めることではない。

1. **意図の語彙が閉じている。** `IntentKind = "transition" | "assign" | "withdraw"`
   （`@receptron/sharedapp/dist/view/intent.d.ts`）と、公開経路の create（`createFields`）。
   これが書き込みの全部である。任意のパッチは無い（原則 11 で意図的に閉じた）。
   だから 6〜7 本のツールで**これから publish される全アプリ**を覆える。
2. **真実が宣言にある**（原則 11）。ページは射影であって権威ではない。LLM は「HTML を読めない
   クライアント」ではなく、**もう 1 つの射影**として設計上ちゃんと座れる。ここが一番大事で、
   もし真実が HTML にあったらこの MCP は原理的に書けなかった。
3. **判定器がライブラリである。** `readIntentMessage` は mulmoserver が `/m/` `/p/` の前で
   走らせているのと同じ関数で、ブラウザに縛られていない。
   そして**ブラウザでない host が会員の操作を実行する前例が既に動いている** —
   `server/backends/sharedApp/previewIntent.ts`（#1802）。バッチの組み方も、mail の
   ドキュメント id（`{cid}_{itemId}_{template}`）も、ミラーの開き直しもそこにある。

## 難所は 1 つだけ — 誰の `request.auth` で書くのか

ルールが答えるのは常に `request.auth` に対してである。いまホストが持っている Firestore ハンドルは
remote-host セッション（`server/backends/remoteHost/session.ts`）＝**著者の Google サインイン**で、
`previewIntent.ts` があれだけ「本番より緩くしない」の注記だらけなのはそのためである。あれは
**owner として書いて会員を演じている**。

この MCP は演じてはいけない。**本人として書く**か、さもなくば作らない。

---

## 決めること

**M1. ツールはアプリごとではない。** アプリの語彙は引数の**値**として現れる
（cid・フィールド名・status の値）。ツール名にアプリの語彙を入れた瞬間、これは汎用ではなくなる。

**実装で変わった**: 7 本のツールではなく **1 本 `useSharedApp` の `action`** にした
（`apps` / `describe` / `records` / `submit` / `transition` / `assign` / `withdraw` / `forget`）。
このリポジトリのホストツールは全部その形（`manageCollection` / `manageAccounting` /
`manageSharedApp`）で、MCP のツール名は**セッションごと・呼び出しごとに繰り返し払う**。
決めたかったのは「語彙が閉じていること」であって本数ではないので、閉じ方を変えずに形だけ合わせた。

**M2. 身元は本人のもの。サービスアカウントは使わない。**
admin 資格情報はルールを丸ごと迂回するので、`firestore.rules` が持っている保証が全部消える
（原則 2 の真逆）。使えるのは Firebase の**ユーザ**のトークンだけである。

**M3. 第 1 段は「自分の MulmoTerminal で、自分として」。**
remote-host セッションで署名しているのは、まさにその人の Google アカウントである。
`members` にそのアドレスが載っていれば、あるいは `uidField` で行を持っていれば、
**いま持っているハンドルが正しい身元**で、新しい認証は要らない。
他人の代理をする話（スタンドアロン MCP）は Stage 3 に置く。

**M4. 判定はホストで、強制はルール。**
ホスト側の判定は**診断**である（原則 2）。`previewIntent.ts` の judge-first とは**理由が違う**
ので、そこをコピーするときに理由まで持ってこないこと:

- `previewIntent` が先に判定するのは、著者が owner でルールがほぼ何でも通すから
  （**ルールより緩くなる**危険がある）。
- この MCP は本人として書くので、ルールが必ず正しく答える。それでも先に判定するのは
  **文言のため**である — 「permission-denied」だけを返すエージェントは、次に何をすればいいか
  言えない。`IntentRefusal` の名前（`illegal-transition` / `unknown-assignee` /
  `not-permitted` / `not-writable`）はそのために存在する。

**M5. capability は publish が残した射影から出す。ページは名乗らない。**
`readIntentMessage` は `(data, write: ProjectedViewWrite[], record, who: { address, tier })` を
取る — `write` は本番では**開いているページの射影**である。MCP にはページが無い。

計画では「宣言とロールから `writeFor` で作り直す」と書いた。**実装で変えた**。作り直しは 2 つの
理由で成立しない:

- 公開された `public.submit` は **window が millis に落ちている**（`projectSubmit`）ので、
  `AuthoredAppZ` ではもう parse できない。
- `apps/{aid}` は `readerOf(a, '*')` なので、**コレクション単位のロールしか持たない人は
  読めない**（`{bookings: "editor"}` の担当者）。作り直しが一番必要な読者が、材料を読めない。

実装が使うのは publish が残した**ティアの射影**そのもので、本番の `/m/` `/p/` が判定に使う
配列と同じものである:

| 文書 | ティア | 誰が読めるか | いつ在るか |
|---|---|---|---|
| `apps/{aid}/member/live:config` | member | ロールを持つ人（`staffOf`） | member ページがあるとき |
| `apps/{aid}/roster/live:config` | roster | 名簿の人（`listedIn`） | participant ページがあるとき |
| `apps/{aid}/config/public` の `write` | roster | 世界 | **公開の submit があれば常に**（ページ不要） |

3 番目が効いていて、**ページを 1 枚も持たないアプリでも参加者の操作（submit / 自分の行の遷移 /
取り下げ）は全部通る**。逆に**スタッフ用ページを持たないアプリは、スタッフに何ができるかを
どこにも言っていない** — そこは推測せず「射影が無い」と答える。

**どのティアで判定するかは、順に試して最初に通ったものにする**（member → roster）。これは権限の
判断ではない: 試すのはどれもこの読者が読める文書で、書き込みは結局ルールが判定する。避けたのは
「1 枚のページを名乗る」こと — 選ぶ根拠が無いので、選んだ瞬間に恣意的な権限モデルが 1 つ増える。

**M6. 書き込みは `performIntent` の形をそのまま使う。**
遷移＋通知、取り下げ＋ミラーの開き直しは**同じ `writeBatch`**。ルールが対の 2 つ目を
`getAfter()` で読むので、単発で書くと拒否される。mail のドキュメント id は**ルールが組み直す**
固定値なので、綴りを変えると誰も送れない文書が積まれる。
CLAUDE.md の「MulmoClaude は参照ホスト」と同じ理由で、**綴りの権威は `../mulmoserver` 側**である。

**M7. 発見は登録簿でやる。クエリではできない。**
`apps/{aid}` は `allow read: if readerOf(app(aid), '*')` で、これは **get であって list ではない**。
「自分が member のアプリ」を引く索引はどこにも無い（`appSlugs` は `published == true` の列挙は
できるが、それは「世界の公開アプリ全部」であって「自分の」ではない）。
決定: **手元の登録簿**（ユーザが slug を足す／`app.json` を持つ手元のリポジトリを拾う）。
これはクライアント側の便宜なので **D7 には触れない** — 登録簿が消えてもアプリは動く。
索引をサーバに作る案は、載せた時点で「誰がどのアプリに入っているか」の表になるので採らない。

**M8. 「取れた」と言わせない。**
定員は**順位から導くもので、ルールは数えられない**（原則 3）。だから `submit` の応答に載せるのは
**順位と、順位が保証ではないこと**であって、「確保しました」ではない。ここを緩めると、
エージェントは平気で嘘をつく。

**M9. 匿名サインインは使わない。**
`emailField` の分岐は `verified()` を要求する（`uidField` は要求しない — U1）。匿名で入れる
アプリはあるが、そこで得た行は**そのセッションが終われば本人に戻せない**ので、
エージェントが取る行動としては不適切である。

**M10. グループは `external`、自動承認はしない。**
`manageSharedApp` は `data` にいるが（自分のワークスペースを publish するので）、これは違う。
**他人のアプリのレコードを動かし、取り消せないメールを飛ばす**ので、`external`
（"reaches a third-party account or API"）が正しい。そして `withdraw` は行を消して枠を
次の人へ渡す＝**取り消せない**ので、`NEVER_AUTO_APPROVED_TOOLS` に入れる
（`manageSharedApp` と同じ扱い）。**実装済み**（`common/toolGroups.ts`）。

**実装で気づいたこと**: グループに 1 本足すと `GuiPanel.vue` の `TOOL_HINTS` にも 1 行要る。
無くても壊れないが、空欄が出る（テストが拾った）。

---

## 段階

| 段 | 中身 | 身元 | 新しく要るもの |
|---|---|---|---|
| **S0** | `listApps` / `describeApp` / `listRecords` — 読むだけ | remote-host セッション | 登録簿、capability の算出 |
| **S1** | `submit`（公開フォーム＝ create） | 同上 | `config/public` の射影を読んでフィールドを埋める |
| **S2** | `transition` / `assign` / `withdraw` | 同上 | `performIntent` の綴りを踏襲したバッチ |
| **S3** | スタンドアロン MCP（どの MCP クライアントからでも） | 独自のサインイン | device-code → Firebase ID トークン。置き場所は `@receptron/sharedapp` の隣か mulmoserver |

**S0–S2 の置き場所**（実装済み）:

- `server/backends/sharedApp/participate/` — `registry.ts`（手元の登録簿）・`app.ts`（slug の解決と
  ティアの射影と読み）・`submit.ts`・`intent.ts`
- `server/infra/use-shared-app-tool.ts` — ツール定義と語り。`server/routes/plugin-routes.ts` に
  `/api/plugin/useSharedApp`（**セッションのディレクトリに紐づけない** — 他人のアプリで何ができるかを
  手元のフォルダが変えてはいけない）
- `server/backends/sharedApp/itemWrites.ts` — **綴りを 1 つにするための抽出**。submission の対
  （create ＋ mirror）と intent の対（遷移＋通知 / 取り下げ＋ミラー）が `previewWrite.ts` と
  `previewIntent.ts` に二重に書かれていたところに 3 つ目が増えるので、先に 1 本にまとめて
  両方をそこに向けた。mail の id は**ルールが組み直す**ので、綴りが 2 つあると
  「誰も送れない文書を積む」が 2 通りに増える
- `test/server/backends/sharedAppParticipate.spec.ts` — 14 本

S0–S2 は MulmoTerminal の中で完結し、既存の GUI MCP に 1 グループ足すだけで済む
（`common/toolGroups.ts` の `GROUP_BY_TOOL`、`server/infra/` にツール本体）。
S3 だけが別の設計判断（認証）を抱えるので、**S2 までを先に出して、使われるか見てから**にする。

## 明示的に「やらない」と言うもの

- **サービスアカウント**（M2）。これを許すと以下の全部が意味を失う。
- **任意のフィールド更新。** 意図は 3 つ＋create。宣言で書けない要求が来ても HTML にも
  パッチにも逃がさない（原則 11）— **宣言の表現力を広げる**のが答えで、その置き場は
  [`plans/feat-shared-app-platform.md`](./feat-shared-app-platform.md) である。
- **合成 id のアプリで「自分の行の一覧」。** `idFrom: "auth.uid+field"` は get はできて
  list はできない（`../mulmoserver/test/rules/rules_ownReadback.ts`）。`uidField` のアプリは 1 クエリで解ける
  （U6）ので、答えられないのは前者だけ — **答えられないと言う**。
- **購読（live）。** 公開ページの live は人が見ている前提の扇形で、エージェントが張り続けるのは
  D7 に近い形になる。訊かれたときに取りに行く。
- **著者の操作。** deploy / publish / unpublish / fork は `manageSharedApp` の仕事で、
  ここに 2 つ目の入口を作らない。

## 「新しい能力を足すときに、先に答えること」への回答

原則の末尾の 8 問に、この計画の答えを先に置く。

1. **強制はどこにあるか** — ルール。ホスト側の判定は文言のためだけ（M4）。**ルール変更は無い。**
2. **どの経路の式数が増えるか** — **増えない。** 既存の `items` create/update と同じ経路を、
   同じ形の書き込みで通るだけである。
3. **ルールの deploy が先か** — 不要（1 の通り）。`protocol` の major も上げない。
4. **live なドキュメントから持ち越されるキー** — 無い。publish には触れない。
5. **live なレコードがあるとき宣言を変えられるか** — 宣言を書き換えないので該当しない。
6. **宣言とスキーマの組** — capability の算出（M5）が両方を見る。`scopedFields.ts` が
   publish 時に見ているのと**同じ組**を実行時に見ることになるので、**片方だけを見て
   組み直さない**こと（ロール名は `app.json`、フィールド名はスキーマ）。
7. **半端に終わった run** — バッチは原子的で、run は 1 操作。掃除の対象が無い。
8. **肯定のテストが同数あるか** — 下記。

## テスト（実装済み: `test/server/backends/sharedAppParticipate.spec.ts`、14 本）

`sharedAppPreviewIntent.spec.ts` が雛形。**リポジトリを一切使わない**のがこのファイルの形で、
publish 済みの文書だけを偽の Firestore に置いて `useSharedApp` を回す。押さえているもの:

- **肯定** — participant が自分の行を宣言された遷移で動かせる／`selfDelete` の status から
  取り下げられる／member がロールの範囲で他人の行を動かせる／通知が**同じバッチ**に入る。
- **否定** — `illegal-transition`、`unknown-assignee`（名簿に無いアドレス）、ロールが運んで
  いない遷移（**どのティアが何と言ったか**を両方出す）、読めない行と存在しない行の区別。
- **綴り** — mail の id が `{cid}_{itemId}_{template}` であること（`../mulmoserver` と
  照合する pin）。
- **M8** — `submit` の応答に "reserved" / "secured" が入らず、"not a place held" が入ること。
- **M5** — アプリ文書が読めない読者（`apps/{aid}` が拒否）でも capability が出ること。
- **読みの scope** — 全体の list が拒否されたら自分の行に落ち、応答が**そう言う**こと。

- **ティアを順に試す**の詰め — member の判定が通って**ルールが拒否した**とき、roster に回して
  そちらが通ること（拒否されたバッチは何も書いていないので、着地する書き込みは 1 本だけ）。
- **型と選択肢** — `describe` が `number` / `enum` を型と `values` ごと出すこと。値は**文字列で
  送る**（`recordOf` が `Record<string, string>` を verbatim に書き、mulmoserver のページも
  そうしている）ので、数値フィールドも公開ページと**同じ文書**になる。
- **cap はクエリに乗る** — 自分の行の読みは `limit()` を積んで発行する。

**実装で 1 つ落とし穴があった**: ティアの射影の文書 id は `config` ではなく **`live:config`**
（`viewDocId` の接頭辞）。テストが直書きして通らず、`viewConfigDocId()` を使って直した。

## 未決

- ~~登録簿をどこに置くか~~ → **`~/.mulmoterminal/shared-apps.json`**（独立ファイル、`describe` が
  成功するたびに自分で埋まる）。手元の `app.json` を持つリポジトリからの自動発見は**未実装**。
- **S3 の置き場所。** MulmoTerminal は npm パッケージなので git ref で依存できない
  （`@receptron/sharedapp` を切り出したときと同じ制約）。sharedapp の隣に
  `@receptron/sharedapp-mcp` を切るのが素直だが、mulmoserver に置けば認証が既にある。
- **`assign` の相手をどう名指すか。** `ViewCapability.assignees` は**アドレスの配列**を返し、
  `describe` はそれをそのまま出している。エージェントに人名で言われたときの解決
  （名簿の表示名 → アドレス）は、どのドキュメントを読むかを決めていない — 原則 5 の境界に触る。
- **実地で通していない。** 全部モックの Firestore に対する緑で、**本物のアプリに対しては
  一度も動かしていない**。最初にやるのは自分が owner でないアプリでの `describe` である。
- **`live` の購読は無い**（そう決めた）。「いま何番目？」は訊かれるたびに読みに行く。
