# 共有アプリ: 公開ページを「予約サイト」にする（公開カスタムビュー + 枠の排他）

**状態**: 設計のみ。実装は未着手。2026-08-12 の議論から。
レビュー（#1658）で見つかった 13 点を反映済み: id の不変性、宣言そのものの変更禁止、
枠の実在**と状態**の確認（`untilField` を含む）、iframe の `event.source` 検証、
bridge の `ready` / `submitResult`、`config/view` の撤去と版の一致、公開読み取りを
`bookings` から `availability` に分離、ホスト用ビューとの契約の分離、publish の順序、
顧客は delete できないこと。
全体設計は [`feat-shareable-collections.md`](./feat-shareable-collections.md)、
行スコープの承認は [`feat-shared-app-assignee-role.md`](./feat-shared-app-assignee-role.md)、
先着枠は [`feat-shared-app-first-come.md`](./feat-shared-app-first-come.md)。

**3 つの独立した変更**に分かれる。1 は単独で価値があり、2 が本体、3 は 2 の後でしか
意味を持たない。

| # | 何を | どこに |
|---|---|---|
| 1 | `idFrom: "field"` — 枠の排他 | core + `firestore.rules` |
| 2 | 公開カスタムビュー | MulmoTerminal（publish）+ mulmoserver（描画） |
| 3 | `salon.md` の更新 | MulmoTerminal |

---

## 作れるようにしたいもの

> 美容院の予約サイト。訪問者は**スタイリストと、それぞれの空き時間**を見る。
> 空いている時間帯を選んで申し込む。埋まった枠は二度と取れない。

アンケートは「フォームを 1 枚出す」で足りる。予約は足りない。現状の判定:

| 要件 | 今 |
|---|---|
| フォームを出す | **できる**（`public.submit`） |
| スタイリスト一覧・空き枠を出す | できない。公開ページはレコードを読まない |
| 「今空いている枠」から選ばせる | できない。選択肢は publish 時に焼かれた静的な `values` |
| 同じ枠を 2 人が取れない | できない。`idFrom` に該当するモードが無い |

`salon.md` テンプレートは既に `"read": ["services", "shifts", "stylists"]` を宣言している。
ルール上は匿名の訪問者も読める。**だが公開ページは読みに行かない** —
`usePublicApp.ts` が取得するのは slug と `config/public` だけで、`items` に触る行が無い。
テンプレートは、ページが果たしていない約束をしている。

---

## 1. `idFrom: "field"` — 枠は数えなくていい

ジムのとき（[first-come](./feat-shared-app-first-come.md)）は「ルールは件数を数えられない」
ので定員を順位に読み替えた。**予約枠は違う。枠は 1 ドキュメントなので、数える必要が無い。**

予約ドキュメントの id を**枠の id そのもの**にする。2 人目の書き込みは既存ドキュメントへの
書き込み ＝ `update` と判定され、`create` しか許していない公開の申込み経路が拒否する。
Firestore の create は原子的なので、これは先着を**本当に強制する** — 順位で見せるより一段
強い保証で、トランザクションも再試行も要らない。

今の `idFrom` は 3 つ（`publishManifest.ts:176`）:

```ts
idFrom: z.enum(["auto", "auth.uid", "auth.uid+field"])
```

`auth.uid+field` は「1 人が 2 枠取ること」を防ぐが、「2 人が同じ枠を取ること」は防げない。
必要なのは**フィールドの値そのものを id にするモード**。

### 変更点

**core** — enum に `"field"` を 1 値。`idField` は既存（`auth.uid+field` と共用）。

**`firestore.rules`** — `idOk` に 1 分岐:

```text
|| (s.idFrom == "field" && "idField" in s
    && s.idField in request.resource.data
    && request.resource.data[s.idField] is string
    && itemId == request.resource.data[s.idField])
```

### id を作った値は不変にする

`idOk` は **create でしか呼ばれない**（`firestore.rules:456`。`updateWith` は呼ばない）。
`idField` を後から書き換えられると、id `slot-a` のドキュメントの `slot` を `slot-b` に
変えられ、**そのあと誰かが id `slot-b` を create できる** — 2 件が同じ枠を主張する。
排他は create の原子性に乗っているので、この 1 点で崩れる。

`updateWith` に足す:

```text
&& (!("idFrom" in s) || s.idFrom != "field" || !(s.idField in changed()))
```

`stampField` の `stampHeld` と同じ形。「create で決まった値は以後動かない」という
既に 1 つある考え方の 2 つ目で、新しい概念ではない。

### 値が本物の枠であることは、ルールが確かめる

id の一意性が防ぐのは「**同じ文字列**を 2 回書くこと」だけ。クライアントはビューを通さず
`slot: "でっちあげ"` で申し込める。UI が枠の妥当性の権威になってはいけない。

宣言に対象コレクションを持たせ、ルールで存在を確かめる:

```json
"idFrom": "field", "idField": "slot", "idIn": "slots"
```

```text
&& exists(/databases/$(database)/documents/apps/$(aid)/collections/$(s.idIn)/items/$(request.resource.data[s.idField]))
```

コストは**書き込み 1 回につき get 1 回**。`window.fromField` が既に同じ枠のレコードを
`get()` しているので、予約の申込みでは実質 1 回増えるだけ（同じドキュメントだが、
ルールの `get` はキャッシュされない）。

`idIn` は `idFrom: "field"` のときだけ意味を持つ。**必須にする** — 省略を許せば
「でっちあげの枠を作れるアプリ」が黙って作れてしまい、それは deploy 時に言うべきこと。

### `exists()` は床であって天井ではない

存在するだけの枠は「空いている枠」ではない。**締め切った枠・取り消した枠・そもそも
受付前の枠も `exists()` を通る。** 要件は「今空いている枠」なので、枠自身の状態と時刻が
create の判定に入っていなければならない。UI の選択結果を信頼しないという話は、
`exists()` で終わりではない。

3 つに分かれ、**2 つは既にあり、1 つは無い**:

| 枠の条件 | 今 |
|---|---|
| まだ開いていない | **ある**。`window.fromField`（同じレコードを既に `get()` している） |
| 枠自体が取り消された・閉じた | **ある**。`idIn` の `get()` に状態の一致を足す（下記） |
| 受付の締切を過ぎた（枠ごと） | **無い**。`window.untilField` が要る |

状態の一致は `idIn` を単なるコレクション名から広げる:

```json
"idFrom": "field", "idField": "slot",
"idIn": { "collection": "slots", "where": { "field": "status", "equals": "open" } }
```

```text
&& (!("where" in s.idIn)
    || get(slotPath).data[s.idIn.where.field] == s.idIn.where.equals)
```

`exists()` は `get()` に吸収される（存在しなければ `get()` 自体が評価エラーで deny に
落ちるので、判定は 1 回で済む）。

**`untilField` はこの機能の一部として入れる。** 当初は「あとで足せる対称な機能」と
書いたが、締切のない予約受付は要件を満たさない。`fromField` の `openedOk` を写して
比較の向きを変えるだけ（`until` は排他のまま — 半開区間の既存の約束を崩さない）。

### 宣言そのものを後から変えられないようにする

不変にしたのはドキュメントの**フィールド**であって、**宣言**ではない。`idField` を
`slot` から `slotId` に、`idIn` を別コレクションに変えると、**過去の ID 空間と新しい ID
空間が分かれる** — 古い行が押さえていたはずの枠を、新しい規則の下で別の ID として
もう一度取れる。排他はドキュメント ID の衝突ひとつに乗っているので、ID の作り方が
変わった時点で過去の行は何も押さえていない。

ルールでは検出できない（既存行を走査できない）。**deploy / publish の門で拒否する。**
そこには既に「新しいスキーマを満たさない既存レコード」を live から読んで数える門が
あり（`records.ts` の `scanRecords`）、これはその隣に並ぶ同じ種類の問い。

**`confirm` では通さない。** 他の記録の門は「壊れると分かっていて書く」を許すが、
ここで壊れるのは記録ではなく**排他の保証**で、壊れたことは誰にも見えない。前に進む道は
コレクションを空にするか、新しい cid で作り直すこと。そう言う。

### `ownRow` には足さないこと

`ownRow`（自分の行の自己編集）は `auth.uid` / `auth.uid+field` / `emailField` を見ている。
**`"field"` の分岐を足してはいけない。** ドキュメント id が枠 id であることは「誰が予約したか」
を一切語らないので、足せば**その枠のドキュメントを、誰でも自分の行として編集できる**ことに
なる。予約者の同定は `emailField` の仕事で、それは既にある。

これは足し忘れではなく**足さないという判断**なので、ルール側にコメントで残す。

### 順序

ルールが先。逆順で core を先に出すと、新しい宣言を古いルールが読み、`idOk` が
`!("idFrom" in s)` でも `== "auto"` でもない値に落ちて **fail-closed** する
（拒否側に倒れるので危険ではないが、申込みが全部通らないアプリが live に出る）。

### キャンセルで枠は空かない（顧客の操作では）

「delete か status か」は選べる 2 つではない。**顧客は delete できない** —
`itemDelete` は `writerOf`（owner / editor）と行スコープの `assignee` だけで、
`ownRow` は宣言された update と transition しか許さない（`firestore.rules:194`）。

したがって:

| 誰が | どうやって | 枠は |
|---|---|---|
| 顧客 | `selfUpdate` で `status: "cancelled"` | **空かない**（ドキュメントが残り id を占有し続ける） |
| 受付・担当 | delete | 空く |

**これは制約ではなく、たぶん正しい運用**でもある。枠が客の操作で即座に他人に開く必要は
なく、受付が確認してから戻す方が店の実態に合う。ただし**そう決めたことをテンプレートに
書く** — 「キャンセルしたのに枠が空かない」は、書いていなければバグに見える。

自動で空けたければ、受付の画面から delete する（`assignee` は自分の担当行を delete できる）。

---

## 2. 公開カスタムビュー

**表示と「選択肢が静的」の 2 つを一度に解く。** スタイリスト × 時間の格子は、素朴なテーブルの
延長では届かない。HTML を書けるなら書ける。

### 置き場所は既に空いている

```text
match /config/{docId} {
  allow read:  if true;
  allow write: if role(app(aid), '*') == "owner";
}
```

`{docId}` はワイルドカードなので、`config/view` に publish された HTML は
**ルールを 1 行も変えずに**匿名の訪問者から読める。**ルール変更は不要。**

制約は Firestore の 1 ドキュメント **1 MiB**。ホスト側のビューはファイルなので上限が無く、
ここで初めて効く。publish 時に測って、超えたら拒否する（deploy/publish の他の門と同じく、
live に出てから気づく形にしない）。

**測るのは HTML ファイルのサイズではなく、書き込むドキュメントの実サイズ。** 上限は
ドキュメント全体にかかり、フィールド名も文字列の UTF-8 長もドキュメント自身のオーバー
ヘッドも数に入る。ファイルが 1 MiB 未満でも超えうる。余白を残して拒否する。

### ホスト側の機構はそのまま載らない

`src/utils/customViewSrcdoc.ts` のビューはこう動く:

```text
window.__MC_VIEW = { slug, token, dataUrl, origin, locale, dict, onChange, openItem, startChat, t }
```

ビューが**自分で** HTTP エンドポイントを叩く。スコープ付きトークンを渡され、CSP の
`connect-src` はサーバのオリジンだけに絞られている。**これはホストという HTTP サーバが
いるから成立する形**で、公開ページにはホストがいない（ブラウザが直接 Firestore を読む）。
トークンを渡す相手も、叩く先も無い。

### 置き換え — 親が読み、ビューは描くだけ

```text
親（PublicApp.vue）─ Firestore を訪問者の権限で読む（public.read のコレクション）
      │ postMessage: { collections: { stylists: [...], shifts: [...], bookings: [...] } }
      ▼
  iframe（srcdoc, sandboxed）─ スタイリスト × 空き枠を描く
      │ postMessage: { submit: { cid: "bookings", values: {...} } }
      ▼
親 ─ ルールに judged される書き込みを行う（今の PublicSubmitForm と同じ経路）
```

今のモデルより**むしろ安全**になる。信頼できない HTML が資格情報を一切持たず、認可は
ルールと親にしか無い。ビューが「予約する」と言っても、通るかどうかを決めるのは常にルール。

### bridge は 4 つのメッセージを持つ

図の「データを渡す・submit を返す」だけでは足りない。**iframe の listener が立つ前に親が
送ればデータは落ちるし、他の訪問者に先を越された結果をビューが表示できない。**

| 向き | メッセージ | いつ |
|---|---|---|
| view → 親 | `ready` | listener を張り終えた。**親はこれを待ってから送る** |
| 親 → view | `state` | 全データ。`ready` の直後と、書き込みが起きたあと |
| view → 親 | `submit` | `requestId` を付ける |
| 親 → view | `submitResult` | 同じ `requestId`、`ok` または理由 |

`requestId` は「どの申込みの結果か」を言うためのもので、連打や再送で答えが入れ替わらない
ようにする。拒否（枠が埋まった・締め切った）は**返す**。返さなければビューは押した瞬間で
止まり、利用者には壊れて見える。拒否のあとは親が `state` を送り直す — 埋まった枠が
埋まったものとして描き直る。

### 親は `event.source` で iframe を同定する

**`event.origin` は使えない。** sandboxed な `srcdoc` iframe のオリジンは opaque（`"null"`）で、
そのビューを同定しない。同じ値を名乗る窓は他にいくらでもある。

親は `event.source === iframe.contentWindow` を見る。これを落とすと、**このページを開いた
別の窓が `{ submit: ... }` を送れる** — `verifiedEmail` のアプリで既にサインインしている
訪問者にとって、それはルール的に正当な書き込みになり、本人が何も触らずに予約が入る。

ホスト側の bridge は既に `event.source` を信頼境界にしている。ここで新しく決めることでは
なく、**同じ契約を公開ページ側にも書く**という話。メッセージの形（`cid` が `public.submit`
に実在すること、値が既知のフィールドだけであること）も親が検証する。

**別の bridge であることを名前で示す。** `__MC_VIEW` を名乗らせない
（`window.__MC_PUBLIC_VIEW` など）。同じ名前で違う契約は、LLM がどちらのビューを書いて
いるか意識しないまま `token` を読もうとして `undefined` を得る形になる。

### CSP は publish のときに一度決め直す

`buildCustomViewCsp` は jsdelivr / unpkg / cdnjs / plotly を許し、`img-src` は `https:` 全体を
許している。これは**自分のマシンで、自分の LLM が書いたビューを、自分が見る**ための判断。

公開ページは「アプリのオーナーが書いた HTML を、**見知らぬ訪問者のブラウザで動かす**」。
`img-src https:` は一方向とはいえ訪問者の IP が第三者に渡るし、CDN からのスクリプトは
オーナーが監査していないコードが訪問者の画面で動くことを意味する。

止める理由ではなく、**同じ許可リストを黙って再利用しない**という意味。既定は絞る側に置き、
緩める必要が出たらそのとき理由付きで足す。

### オーサリング — 同じ置き場所、別の契約

パスの規約（`views/*.html`、`isSafeCustomViewPath`、`templatePath.ts:43`）は共有する。
**中身は共有しない。** ホスト用ビューは `__MC_VIEW.token` と `dataUrl` を読むので、
公開ページに置けば描画されずに終わる。「同じ `views/*.html` を再利用する」とだけ書くと、
既存のビューを `public.view.path` に指すのが正しいように読める — それは動かない。

- 公開用ビューは `window.__MC_PUBLIC_VIEW` だけを読む。両対応のアダプタは作らない
  （2 つの契約を 1 つの HTML が抱えると、LLM はどちらで書いているか分からなくなる）
- publish の検査で、指されたファイルが `__MC_VIEW` を参照していたら**拒否して理由を言う**
  — これはホスト用ビューです、と
- テンプレートの `views/booking.html` は公開用として書き下ろす

どのビューを公開ページに出すかは宣言で名指しする:

```json
"public": {
  "enabled": true,
  "read": ["stylists", "availability"],
  "view": { "path": "views/booking.html", "collections": ["stylists", "availability"] },
  "submit": { "bookings": { ... } }
}
```

`public.view` があるとき、公開ページはフォームの代わりにビューを描く（`submit` は
**残す** — ビューが postMessage で使う申込み経路の定義そのものだから）。

### `bookings` を公開読み取りにしてはいけない

**Firestore の読み取りはドキュメント単位で、フィールド単位に絞れない。** `bookings` を
`public.read` に入れた瞬間、氏名・メールアドレス・電話・備考が匿名の訪問者に全部返る。
テンプレートの注意書きでは防げない — 宣言が 1 行あれば漏れる。

**公開用のコレクションを分ける。** `availability` は枠ごとに 1 行、持つのは
「いつ・誰の担当・空いているか」だけで、個人情報を一切持たない。予約が入ったら受付側の
処理が該当行を閉じる。当初の案（`bookings` をそのまま見せて注意書きを添える）は**取り下げ**。

これは同時に、次の 2 つの答えでもある:

- **payload の大きさ。** `bookings` の全履歴を送る設計だったものが、`availability` の
  「これから先の枠」になる。期間で切れる形になったので、親のクエリに上限（先 N 日 /
  最大 M 件）を置ける。読み取り・メモリ・structured clone のコストが履歴に比例しなくなる
- **ビューが何を必要とするか。** `public.read` から推測するのではなく、
  `public.view.collections` で**宣言する**。親はその集合だけを送り、publish の検査は
  そこに挙がったものが `public.read` にあるかを見る（推測だと、ビューが黙って空の格子を
  描く壊れ方に戻る）

### 撤去したら消すこと

`config/{docId}` は**常に**匿名で読める。`public.view` を宣言から外しても、アプリを
unpublish しても、`config/view` を明示的に消さない限り **HTML は誰でも取り出せるまま残る**。
今の unpublish は `config/public` しか消していない。

- `public.view` が無くなった publish → `config/view` を削除
- unpublish → `config/view` も削除

publish が「対になるものを書く」操作である以上、撤去も対で行う。#1655 で
`stagedRuleConfig` の対を落として見つかったのと同じ形の抜け。

### 2 つの公開ドキュメントは同じ版であること

`config/public` と `config/view` は別々の書き込みで、publish は途中で失敗しうる
（`publish.ts` の `runWrites` は段階を順に実行する）。**新しい `config/public` と古い
`config/view` の組み合わせ**が残ると、ビューは自分が知らないフィールドの入った状態を
渡され、黙って描き損なう。

両方に publish の版を刻み、親が**不一致なら描かずに言う**。一括で書ければそれでよいが、
順序に意味がある（`config/public` は訪問者が読む唯一のもの）ので、版で照合する方が
この設計には合う。unpublish の削除も同じ扱い。

### 検査（deploy/publish の門）

- `public.view.path` が実在し、`views/*.html` に収まっていること
- 1 MiB に収まること
- ビューが読むと宣言したコレクションが `public.read` にあること
  （**無いと「ビューは出るがデータが空」という最悪の壊れ方**をする。ルールが拒否するのは
  親の読み取りで、ビューはそれを知らずに空の格子を描く）

---

## 3. `salon.md` の更新

ここまで来て初めて、テンプレートの `public.read` が意味を持つ。

- `slots`（枠）コレクションを足す。主キーは `stylist-date-time` のような合成スラッグ
- `availability`（公開用）— 枠ごとに「いつ・誰の担当・空いているか」だけ。**個人情報は持たない**。
  `public.read` に入れるのはこれで、`bookings` は入れない
- `bookings` は `idFrom: "field"` + `idField: "slot"`
- `startAt` を客に手で打たせるのをやめる（今そうなっているのは回避ではなく、
  **これしかできなかった**から）
- `views/booking.html` — スタイリスト × 時間の格子。埋まっている枠は選べない
- キャンセル: 顧客は `status: "cancelled"`、枠を戻すのは受付の delete。**両方書く**

**利用者に先に言うこと**（gym.md と同じ位置に置く）:

- 空き枠は `availability` として**別に持つ**。予約そのもの（氏名・連絡先）は公開しない。
  Firestore の読み取りはドキュメント単位でフィールドを隠せないので、これは運用の注意では
  なく**構造**で守る
- 枠は**先着で本当に排他される**。ジムの順位方式と違い、繰り上げは起きない
- **顧客がキャンセルしても枠はすぐには空かない。** 受付が戻す操作が要る

---

## やらないこと

**`public.read` を素朴なテーブルとして描く。** 2 が入るなら、素朴な表は「スタイリスト ×
時間の格子」には結局届かないのに、公開ページに 2 つ目の描画経路を残すことになる。
1 つの描画経路にする。

**ビューに Firestore SDK を持たせる。** sandboxed iframe のオリジンは opaque で、資格情報を
渡す先として正しくない。読むのは親、という上の分割がその答え。

**Functions。** 空き枠の計算も排他も、読む側の描画とドキュメント id の衝突で足りる。

---

## リポジトリ横断

| | 1 (`idFrom`) | 2 (公開ビュー) | 3 (salon) |
|---|---|---|---|
| mulmoserver | `firestore.rules`（+ deploy） | `PublicApp.vue` / `usePublicApp` / bridge | — |
| mulmoclaude | `publishManifest` の enum + `idIn` + `untilField` | `public.view` の宣言 + 検査 | — |
| mulmoterminal | 排他キーの変更を拒否する門 | publish（`config/view` の書き出しと削除）+ 検査 | テンプレート |

1 は**ルールの deploy が先**（上記）。

2 は **mulmoserver が先**。「`public.view` が無ければ今の挙動」は既存アプリを守るだけで、
**新しく `public.view` を publish したアプリを守らない** — 古い公開ページはその宣言を
読めず、訪問者は「記入するものはありません」を見る。publish した本人には成功と見える。
mulmoserver を先に deploy するか、それが出るまで `public.view` の publish を拒否する。
