# 親を 1 つにする — preview と本番、`/a` と `/m` と `/p` の差をなくす

**状態**: 実装済み（3 リポジトリとも PR 提出、`@receptron/sharedapp` の npm 公開待ち）
**日付**: 2026-08-19
**前提**: [`docs/shared-app-principles.md`](../docs/shared-app-principles.md)（不変条件）、
[`plans/feat-shared-app-preview.md`](./feat-shared-app-preview.md)（プレビューは親を共有する、という決定）、
[`plans/feat-shared-app-member-write.md`](./feat-shared-app-member-write.md)（`/m` と `/p` の書き込み）

この計画が答える問いは 1 つ:

> **同じ HTML が、`/a` と `/m` と `/p` とプレビューで違う動きをする。
> どれが「してはいけないこと」で、どれが「配線されていないだけ」なのか。**

答えは **ほとんど全部が後者**である。禁止は Firestore のルールが既に持っていて、
今そこにあるのは**ポートの形をした禁止** — 親が答えないから、ページの promise が
永久に解決しない、という形の「禁止」だった。

## 1. 実測した差分

`@receptron/sharedapp` の bootstrap（`src/view/srcdoc.ts`）は**1 つ**で、
`/a` も `/m` も `/p` もプレビューも同じものを注入される。ページが呼べる語彙は
どこでも同じ 5 つ — `submit` / `transition` / `assign` / `withdraw` / `mine`。

違うのは**親が何に答えるか**だけである。

| ページが呼ぶ | `/a` 公開（`viewBridge`） | `/m` `/p`（`memberBridge`） | MT ペイン公開 | MT ペイン会員 |
| --- | --- | --- | --- | --- |
| `submit` | 確認 → 書く | **`unsupported-request`** | 確認 → 書く | 同左 |
| `transition` / `assign` / `withdraw` | **黙って落ちる（永久に待つ）** | 判定 → 書く | 黙って落ちる | 判定 → 書く（#1802） |
| `mine(cid, key)`（lookup） | 読む | **常に `known:false`** | **ポート無し → `known:false`** | 常に `known:false` |
| `viewer.mine`（state に同梱） | 付く | **付かない** | **付かない** | 付かない |
| `viewer.me` / `viewer.can` | **付かない** | 付く | 付かない | 付く |

太字が「してはいけないこと」ではなく「配線されていないだけ」のもの。

**最悪の 1 マスは `/a` の intent** である。`readSubmitMessage` は intent を
`{ ok:false, reason:"not-a-submission", requestId:"" }` として返し、`offer` は
`requestId === ""` を「誰も待っていない」と読んで答えない（`bridge.ts` の `offer`）。
だが**待っている**。ページの `transition()` は settle しない promise を握ったままになる。
両方の bridge のヘッダが「view を待たせたままにするのは死んだボタンだ」と書いている、
まさにその失敗が公開ページに残っていた。

## 2. ルールは既に許している

差分表の禁止のうち、**ルールが本当に禁じているものは 1 つも無い**。
`mulmoserver/firestore.rules` の該当行:

- `ownRow(a, s, cid, itemId)`（304 行）が要求するのは **`authed()` と `subOpen` だけ**。
  ロールもテナントも要らない。匿名セッションの uid でも通る（コメントがそう明言している）。
- 更新 (765–772 行): `isWriter(r)` **または** `ownRow(...) && !finalize && inWindow && selfWriteOk(c, s)`。
  `selfWriteOk` は `public.submit[cid].selfUpdate` / `selfTransitions` を現在ステータスごとに読む。
- 削除 (244 行): `isWriter(r)` / 担当者 / **`selfDelete(...)`** — これも `ownRow` ベース。
- 読み (285 行 `readWith`): 最後の枝が `ownRow`。**自分の行は誰でも読める。**

つまり **`/a` の訪問者と `/p` の参加者は、自分の行に関してルール上まったく同じ権限を持つ**。
`selfTransitions` と `selfDelete` は `public.submit[cid]` に書く宣言であって、
参加者層だけのものではない — なのに投影は participant 層にしか出していない
（`appViews.ts` の `transitionPart` / `withdrawPart` が `Exclude<ViewAudience,"public">` を取る）。

**だから公開ページは、ルールが許している「自分の予約を取り下げる」を宣言できず、
親も答えず、ページは永久に待つ。** これが今回直すものの中心である。

## 3. 設計

原則を 3 つに畳む。

**P-1. 語彙は 1 つ、親も 1 つ。** `viewBridge` と `memberBridge` を 1 つの親
（`viewParent`）に統合する。どの audience でも 5 つの ask すべてに**答える** —
実行するか、理由を付けて断るか。**黙って落とす枝を 1 つも残さない。**

**P-2. audience が決めるのは「答え」であって「語彙」ではない。**
何ができるかは投影とルールが決める。親の形は決めない。
具体的には、公開層にも `write` 投影を出す:

- `public` audience → `WriteTier` は **`roster`**。同型だからである — `roster` 層の
  意味は「ロールは無い、ルールが**記録から**答える」で、`ownRow` はまさにそれ。
- `viewer.me` は**他のページと同じ規則** — サインイン済みの住所、無ければ空。匿名セッションには
  住所が無いので「無い」は普通の答えであり、`roster` 層の `capabilityOf` は `me` を読まないので
  どちらでも整合する。**自分の行かどうかは `viewer.mine` と `view.mine()` が答える** — 住所の
  比較ではなく。ルールは記録の上の uid か検証済み住所で自分の行を判定するので、そのどちらも
  ページが持っているとは限らないからである。
  （当初は公開層だけ `me: null` に固定する案だったが、専用のヘルパを 1 本増やすことになり、
  それは「2 つのホストが食い違える場所を 1 つ増やす」ことなので、`viewerFor(writes, address,
  PUBLIC_WRITE_TIER)` という**全ページ共通の 1 本**に寄せた。）
- `withdrawFrom` は `selfDelete`、`transitionAny` は `selfTransitions` から。
  どちらも既にある宣言で、**ルールの変更は要らない**。

**P-3. 確認ダイアログは ask の種類が決める。audience は決めない。**
`submit`（見知らぬ人が新しい記録を提案する）は全 audience で確認を出す。
intent（既にある自分の行を動かす）は全 audience で出さない。
今の「公開だけ確認、会員は確認なし」は audience 依存に見えて、実は
**ask 依存**でよく、そう言い直すと `/a` と `/m` の差が 1 つ消える。

## 4. 意図的に残る非対称

**ヘッドレスは書かない。** `manageSharedApp` の `action: "preview"` は実ブラウザで
ページを走らせるが書き込みは行わない。これは親ではなく lint であり、
「本番と同じ」を要求する対象ではない。ただし**語彙には答える** — 断り方は
`read-only` で、黙って落とさない。

**プレビューの読みは著者の資格で行われる。** ペインは著者の Mac で動くので、
`scope: "own"` の絞り込みは**ホスト側で**行う（`preview.ts` に既にある）。
ルールが訪問者に対して行う絞り込みを、著者の資格のまま模す — これは
「プレビューが本番より緩くならない」ための既存の決定であって、
差分ではなく差分を消すための仕掛けである（`previewIntent.ts` の `NOT_IN_VIEW` と同じ理屈）。

## 5. 手順

順送りで 4 本。`@receptron/sharedapp` は npm 経由なので、公開が両ホストの前提になる。

1. **sharedapp** — 親の統合（P-1）、公開層の `write` 投影と `viewerFor` の公開対応（P-2）、
   自分の行の射影（今 mulmoserver の `publicOwnView.ts` にあるもの）をパッケージへ移す。
   `viewBridge` / `memberBridge` は 1 リリースのあいだ薄い包みとして残す。
2. **mulmoserver** — `PublicViewFrame` に `perform` を、`AppViewFrame` に `mine` / `lookup` /
   `submit` を配線。`useAppIntent` は既に tier 引数を取るので `roster` を渡すだけ。
   ルール変更は無い見込み — emulator (`yarn test:rules`) で「公開の訪問者が自分の行を
   selfTransition / selfDelete できる」を固定する。
3. **mulmoterminal** — ペインの 2 つの親を統合後の 1 つにし、公開側に `mine` / `lookup` /
   `perform` を配線。`preview.ts` は公開ページの submit 先を `scope: "own"` でも読む。
   ヘッドレスも同じ語彙に答える。
4. **ドキュメント** — `mulmoterminal-shared-app` の SKILL とテンプレート。
   「`/a` では `mine` が来ない」という現状の前提で書かれた記述を消す。

## 6. 実装の結果

3 本とも上の手順どおりに入った。予定と変わった点だけ書く。

**会員ページの submit は、宣言をどこから読むかで解けた。** 層 config には `form`（描画される
フィールド）が無いので不可能に見えたが、**`config/public` は `allow read: if true`** で、id 戦略も
描画フィールドもそこにある。`/m` `/p` はそれを読み、`/a` と**同じ配線**（`ownSubmissionPorts.ts`）を
共有する。publish の投影は変えていない。

**公開ページの intent は「自分の行がデータセットに無い」で 1 回落ちた。** 人が submit する
コレクションは `public.read` が開けない唯一のもの — 開けば訪問者が互いの回答を読める — なので、
公開ページが動かす行は**データセットには絶対に無い**。`viewer.mine` として届く。判定は
「ページのデータセット **∪** 読み手自身の行」に対して行う（`previewIntent.ts`）。

**ルックアップの「読めなかった」と「無かった」を 1 度取り違えた。** 実装は `.catch(() => null)` で
両方を "not found" に潰していて、テストが落として直した — このモジュール自身のヘッダが警告している
まさにその誤りだった。

**ルールは 1 行も変えていない。** mulmoserver の emulator は 182 pass。主張（公開の訪問者が自分の
行を動かして取り下げられる）は `rules_selfDelete` / `rules_uidField` が既に固定していた。

## 7. 検査

- **rules emulator** — 公開の訪問者（ロール無し・匿名可）が自分の行を読み・
  selfTransition し・selfDelete できること、他人の行はできないこと。
- **パッケージ** — 5 つの ask × 4 audience の表を 1 本のテストで固定する
  （「黙って落ちる枠が無い」ことを含む）。
- **ホスト** — `/a` と `/m` と MT ペインが**同じポート集合**を渡していることを、
  ポート名の集合を突き合わせる形で固定する。名前の集合なら、片方に足して
  片方に足し忘れたときに落ちる。
