# 共有アプリ: 公開ページを「予約サイト」にする（公開カスタムビュー + 枠の排他）

**状態**: 設計のみ。実装は未着手。2026-08-12 の議論から。
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

```
|| (s.idFrom == "field" && "idField" in s
    && s.idField in request.resource.data
    && request.resource.data[s.idField] is string
    && itemId == request.resource.data[s.idField])
```

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

### 未解決 — キャンセルで枠は空くのか

枠 id ＝ ドキュメント id なので、**予約を delete すれば枠は空く**。これは望ましい場合も
望ましくない場合もある（「キャンセルは受付を通すこと」という店の運用がありうる）。
`selfUpdate` で `status: "cancelled"` にするだけならドキュメントは残り、枠は空かない。
どちらを既定にするかは 3（テンプレート）で決める。ルールとしてはどちらも今のまま表現できる。

---

## 2. 公開カスタムビュー

**表示と「選択肢が静的」の 2 つを一度に解く。** スタイリスト × 時間の格子は、素朴なテーブルの
延長では届かない。HTML を書けるなら書ける。

### 置き場所は既に空いている

```
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

### ホスト側の機構はそのまま載らない

`src/utils/customViewSrcdoc.ts` のビューはこう動く:

```
window.__MC_VIEW = { slug, token, dataUrl, origin, locale, dict, onChange, openItem, startChat, t }
```

ビューが**自分で** HTTP エンドポイントを叩く。スコープ付きトークンを渡され、CSP の
`connect-src` はサーバのオリジンだけに絞られている。**これはホストという HTTP サーバが
いるから成立する形**で、公開ページにはホストがいない（ブラウザが直接 Firestore を読む）。
トークンを渡す相手も、叩く先も無い。

### 置き換え — 親が読み、ビューは描くだけ

```
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

### オーサリング

ホスト側と同じ `views/*.html`（`isSafeCustomViewPath`、`templatePath.ts:43`）を再利用する。
どのビューを公開ページに出すかは宣言で名指しする:

```json
"public": {
  "enabled": true,
  "read": ["stylists", "shifts", "bookings"],
  "view": { "collection": "bookings", "path": "views/booking.html" },
  "submit": { "bookings": { ... } }
}
```

`public.view` があるとき、公開ページはフォームの代わりにビューを描く（`submit` は
**残す** — ビューが postMessage で使う申込み経路の定義そのものだから）。

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
- `bookings` は `idFrom: "field"` + `idField: "slot"`
- `startAt` を客に手で打たせるのをやめる（今そうなっているのは回避ではなく、
  **これしかできなかった**から）
- `views/booking.html` — スタイリスト × 時間の格子。埋まっている枠は選べない
- キャンセルの既定（delete か `status` か、上記「未解決」）をここで決めて書く

**利用者に先に言うこと**（gym.md と同じ位置に置く）:

- 空き枠が見えるということは、**訪問者が予約テーブルを読めるということ**。誰が何時に来るかを
  隠したいなら、`bookings` を `public.read` に入れず、`slots` に「埋まっているか」だけを
  持たせる設計にする（その場合、埋まりの反映は受付の操作になる）
- 枠は**先着で本当に排他される**。ジムの順位方式と違い、繰り上げは起きない

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
| mulmoclaude | `publishManifest` の enum | `public.view` の宣言 + 検査 | — |
| mulmoterminal | — | publish（`config/view` への書き出し）+ 検査 | テンプレート |

1 は**ルールの deploy が先**（上記）。2 は core の宣言が先で、mulmoserver の描画は後から
足しても既存アプリを壊さない（`public.view` が無ければ今の挙動）。
