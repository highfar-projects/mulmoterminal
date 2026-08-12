# テンプレート: 予約と承認（美容室）

**いつ使うか** — 申込みを受けて、**担当者が自分の分だけ承認する**アプリ。美容室の予約、
面談の申込み、修理の受付、査読の割り当て。「誰が担当か」で権限が変わるものはこの形。

このテンプレートの要点は `assignee` ロールです。担当者は**全予約を見て、自分の担当だけ
書き換えられる**。受付は全予約を書き換えられる。この 2 つを同時に表現できるのは、絞りが
コレクションではなく**名簿の側**にあるからです。

---

## app.json

```json
{
  "aid": "(init が書きます。手で触らないこと)",
  "name": "さくら美容室",
  "slug": "sakura-hair",
  "members": {
    "owner@salon.jp": { "*": "owner" },
    "reception@salon.jp": { "bookings": "editor", "shifts": "viewer", "services": "viewer" },
    "anna@salon.jp": { "bookings": "assignee", "shifts": "viewer", "services": "viewer" },
    "ben@salon.jp": { "bookings": "assignee", "shifts": "viewer", "services": "viewer" }
  },
  "collections": {
    "bookings": {
      "submitOnly": true,
      "assigneeField": "stylistEmail",
      "statusField": "status",
      "transitions": {
        "initial": ["pending"],
        "pending": ["approved", "rejected"],
        "approved": ["cancelled"]
      },
      "mail": {
        "toField": "customerEmail",
        "on": { "booking-approved": { "from": ["pending"], "to": "approved" } }
      }
    }
  },
  "public": {
    "enabled": true,
    "read": ["services", "shifts", "stylists"],
    "submit": {
      "bookings": {
        "auth": "verifiedEmail",
        "emailField": "customerEmail",
        "createFields": ["customerName", "customerEmail", "service", "startAt", "status"],
        "initialStatus": "pending",
        "selfUpdate": { "pending": ["startAt", "service"] },
        "selfTransitions": { "pending": ["cancelled"] }
      }
    }
  }
}
```

## .claude/skills/bookings/schema.json

```json
{
  "title": "予約",
  "icon": "event",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "customerName": { "type": "string", "label": "お名前", "required": true },
    "customerEmail": { "type": "email", "label": "メール", "required": true },
    "service": { "type": "enum", "label": "メニュー", "values": ["カット", "カラー", "パーマ"], "required": true },
    "startAt": { "type": "datetime", "label": "希望日時", "required": true },
    "stylistEmail": { "type": "email", "label": "担当（アドレス）" },
    "stylist": { "type": "ref", "label": "担当", "to": "stylists" },
    "status": { "type": "enum", "label": "状態", "values": ["pending", "approved", "rejected", "cancelled"] }
  }
}
```

`stylists` / `services` / `shifts` は普通のコレクション（`storage: {"type":"firestore"}` だけ
足す）。担当者一覧、メニューと所要時間、シフト表です。

---

## なぜこの形か — 迷いやすい 5 点

### 1. 担当は `stylistEmail`（アドレス）で、`stylist`（ref）ではない

ルールが比較できるのは `request.auth.token.email` だけです。`ref` が保存しているのは
**参照先の主キー slug**（`anna`）であってアドレスではないので、`assigneeField` に ref を
指定すると誰にも一致しません。`check` が拒否します。

**両方持つのが正解**です。`stylist`（ref）は画面に出す用、`stylistEmail` は権限用。
`stylists` コレクションの主キーをアドレスにすれば 1 本で済みますが、公開ページに
スタッフのアドレスが出るので勧めません。

### 2. 担当を割り当てるのは受付（editor）で、客ではない

`createFields` に `stylistEmail` を入れれば「客が担当を指名する」形にできますが、
それは**客が「誰にこの行の権限が渡るか」を決める**ということです。予約アプリとしては
自然な要求なので禁止はしていませんが、意図してやるときだけにしてください。

初期状態では `stylistEmail` が空で、受付が入れるまで誰の担当でもありません。
その間 pending の予約を承認できるのはオーナーと受付だけです。

### 3. `submitOnly: true` を外せない — その代わりスタッフの代理入力ができない

`emailField` を宣言した時点で、そのレコードは「この人が申し込んだ」という意味を持ちます。
`submitOnly` はそれを守るもので、**publish が要求します**（無いと owner / editor が誰の
名前でもレコードを作れてしまう）。

代償として、**電話予約をスタッフが代わりに入力することはできません**。どうしても必要なら
`emailField` を外すことになり、そのとき失うのは「マイ予約」ページ（客が自分の予約を見て
キャンセル・変更する）です。どちらを取るかは店の判断で、コードの都合ではありません。

### 4. 承認は状態機械が縛る — 担当者も例外ではない

`transitions` は writer 経路にも効きます。`cancelled` の予約をいきなり `approved` に
飛ばすことは、受付にもオーナーにもできません。`approved` になれるのは `pending` からだけ。

### 5. 承認メールは担当者も出せる、ただし自分の担当の分だけ

`mail` は「宣言した遷移が実際に起きたとき」にだけ積めます。宛先も本文もレコードから
再導出されるので、担当者が選べるのは**どのレコードか**だけで、そこにも同じ絞りが
かかっています。

---

## 担当者に何ができて、何ができないか

| | オーナー | 受付 (editor) | 担当 (assignee) |
|---|---|---|---|
| 全予約を**読む** | できる | できる | **できる**（当日の全体が見えないと働けない） |
| 自分の担当を承認 | できる | できる | **できる** |
| 他人の担当を承認 | できる | できる | **できない** |
| 担当を付け替える | できる | できる | **できない**（自分に付け替えて奪うのも、他人に投げるのも） |
| 予約を消す | できる | できる | 自分の担当だけ |
| シフト・メニューを編集 | できる | 読むだけ | 読むだけ |
| publish | **できる** | できない | できない |

`assignee` は**コレクションを名指しして**与えます。`{"*": "assignee"}` は拒否されます —
「自分の行」が何を指すかはコレクションごとに違うためです。

---

## 作る順番

1. `init`（`slug` に店の名前）
2. `stylists` / `services` / `shifts` / `bookings` のスキル + スキーマを書く
3. `check` — ここで `assigneeField` の型やロールの過不足が出ます
4. `deploy` → 名簿の人に URL を渡す
5. スタッフを `invite`（担当者は `role: "assignee"` と `cid: "bookings"`）
6. 客に開くときだけ `publish`

参照: [SKILL.md](../SKILL.md) の「公開するとき」、先着順の申込みは
[gym.md](./gym.md)。
