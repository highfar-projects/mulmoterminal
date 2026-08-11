# 共有コレクション: 作成から公開までの流れ

**状態**: 2026-08-11 の設計議論を反映したシナリオ。決定の根拠は
[`memo-shared-collection-ids.md`](./memo-shared-collection-ids.md)、
全体設計は [`feat-shareable-collections.md`](./feat-shareable-collections.md)。
**実装済みと未実装が混在している** — 各ステップ末尾と最後の表を参照。

---

## この機能は誰のためのものか

| | 何を使うか | 何をするか |
|---|---|---|
| **作る人** | **MulmoTerminal**（プロジェクトフォルダ） | コレクションを作り、名簿を書き、publish する |
| **使う人** | **Web サイト** | 公開ページから読む・申し込む。メンバーはサインインして自分の分を扱う |

**使う人は MulmoTerminal を持ちません。** 招待された人が自分のホストでそのコレクションを
開く、という形は取りません（そのための機構は落としました）。

---

## 用語 — 3 つだけ

| 用語 | 何者か | 形 | 誰が決めるか |
|---|---|---|---|
| **slug** | コレクションの名前 = スキルのディレクトリ名 | 人間可読 | 作る人（LLM） |
| **cid** | アプリの中でのコレクションの ID | **slug と同じ** | — |
| **aid** | アプリの ID。アプリ = フォルダ 1 つ | **UUID** | **コードが生成** |

**なぜ aid だけ UUID か。** `apps/{aid}` は**全ユーザー共通の棚**で、ルールは「自分を
オーナーと名乗ること」しか要求しない — つまり**早い者勝ち**で、人間可読だと先回りして
押さえられます。cid はその aid の下に閉じていて、しかもフォルダ内のディレクトリ名なので、
**ファイルシステムが一意性を保証**します。名前空間の性質が違うので、扱いも違います。

人が配る URL は aid ではなく、**別に確保する slug**です（ステップ 4）。

---

## 全体像

```
              👤 あなた            🤖 LLM                   💾 できるもの
 ──────────────────────────────────────────────────────────────────────────────
 1. コレクション  「作って」        schemaDocs → putSchema    .claude/skills/<slug>/
 2. アプリ宣言   「共有したい」     app.json を書く            <repo>/app.json
 3. 招待        「◯◯さんに権限を」 members を書く             <repo>/app.json
 ──────────────────────────────────────────────────────────────────────────────
 4. publish     「publish して」   publishApp                apps/{aid} ほか
 ──────────────────────────────────────────────────────────────────────────────
 5. 他の人      URL を開く         —                         Web ページ
```

**1〜3 はローカルのファイルだけ**で、誰の画面も変わりません。**4 で初めて公開**されます。

---

## ステップ 1 — コレクションを作る

### 👤 あなた

> 「美容室の予約を管理するコレクションを作って」

### 🤖 LLM

1. `manageCollection` の **`schemaDocs`** — スキーマの書き方を読む
2. **`SKILL.md`** と **`schema.json`** を書く（新規作成はファイル書き込み）
3. `manageCollection` の **`putSchema`** — 検証して保存

### 💾 できるもの（ローカル）

```
<プロジェクトフォルダ>/.claude/skills/bookings/
├── SKILL.md
└── schema.json
```

```json
{
  "title": "予約", "icon": "event",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "fields": { }
}
```

`storage.type: "firestore"` が「これは共有する」という宣言です。**cid は書きません** —
ディレクトリ名（`bookings`）がそのまま cid になります。

> **このフォルダには非共有のコレクションを置けません。** `app.json` があるフォルダの
> コレクションは全部 firestore ストレージである、という規則です。フォルダの性格を
> 1 つに定めるためで、下書きやローカル専用のメモは別のフォルダに置きます。

**実装状況**: 動く。ただし「混在禁止」の規則は**未実装**。

---

## ステップ 2 — アプリを宣言する

コレクションが属する「アプリ」を宣言します。**アプリ = フォルダ 1 つ**で、その中の
コレクションが**1 つの名簿**を共有します。

### 👤 あなた

> 「これを共有したい。URL は sakura-hair にして」

### 🤖 LLM

`app.json` を書く

### 💾 できるもの（ローカル）

```json
{
  "name": "Sakura Hair 予約",
  "slug": "sakura-hair",
  "members": {
    "satoshi@example.com": { "*": "owner" }
  }
}
```

**`aid` は書きません。** コードが UUID を生成して書き戻します。**`owner` も書きません**
（publish があなたの uid を刻みます）。

`slug` は**希望**です。既に取られていたら publish が `sakura-hair-2` のように番号を
付けて確保します（ステップ 4）。

**実装状況**: `aid` の自動生成と `slug` は**未実装**（いまは aid を手で書く）。

---

## ステップ 3 — 権限を与える

`members` に**メールアドレス**を足すだけです。相手の事前登録は要りません。

```json
{
  "members": {
    "satoshi@example.com": { "*": "owner" },
    "tanaka@salon.jp":     { "bookings": "editor" }
  },
  "public": {
    "enabled": true,
    "submit": {
      "bookings": {
        "auth": "verifiedEmail",
        "createFields": ["customerName", "customerEmail", "startAt", "status"],
        "initialStatus": "pending"
      }
    }
  }
}
```

### ロール

| ロール | できること |
|---|---|
| **owner** | 全部 + **publish** + 名簿の編集 |
| **editor** | レコードの読み書き |
| **viewer** | レコードの読み取り |
| **participant** | **自分の行だけ**読める |

`"*"` はアプリ全体、`"bookings"` はそのコレクションだけ。上の田中さんは**予約だけ** editor。

`public.submit` は**名簿に載っていない人**（お客さん）向けの投稿口です。

> **`memberEmails` は書きません** — publish が `members` から生成します。Web ページが
> 「自分が参加しているアプリ」を引くための項目で、手で書くと不一致でルールに拒否されます。

**実装状況**: 動く。

---

## ステップ 4 — publish する（唯一の危険な操作）

ここまではローカルのファイルだけです。**publish した瞬間に公開されます。**

### 👤 あなた

> 「publish して」

### 🤖 LLM

`manageCollection` の **`publishApp`**

### publish がやること

1. `app.json` を読む
2. **`aid` が無ければ UUID を生成し、`app.json` に書き戻す**（一度きり・不変）
3. **URL slug を確保する** — 希望が空いていればそれ、取られていたら番号を付ける。
   確保できたら `app.json` に書き戻す（以降は再生成しない）
4. **拒否できるものを全部拒否する**（下記）
5. **ライブレコードを事前検証** — 新スキーマで壊れる既存レコードがあれば**止まる**
   （`confirm` で強行可能）
6. **ドキュメントを書く**

### 💾 できるもの（Firestore）

```
apps/{aid}                        ← 名簿・公開設定（ルールが読む）
  ├── collections/bookings        ← publishedSchema（Web ページが描画に使う）
  └── config/public               ← 公開設定（未ログインでも読める。名簿は含まない）

appSlugs/sakura-hair              ← { aid } の逆引き（URL → アプリ）
```

### publish が拒否するもの

エラーではなく**設計の門番**です:

- **投稿者に紐づくレコードなのに `submitOnly` が無い** → オーナーが他人の名前でレコードを作れる
- **`createFields` に primaryKey が入っている** → 投稿者が他人のレコードの ID を名乗れる
- **`window` の期限が逆** / **`initialStatus` に対応する `statusField` が無い** →
  誰も投稿できなくなる（しかも**エラーが出ない**）
- **リポジトリに無いコレクションを名指ししている** → 宣言が黙って無効になる

> **記名と巻き戻し。** 誰が・どのコミットから・いつ publish したかが記録され、
> **前の版が `previousPublished` に保存**されます。作業ツリーが汚れていれば
> `publishedDirty` が付きます（そのコミットは中身を説明していないため）。

**実装状況**: 4〜6 は動く。**2（aid 生成）と 3（slug 確保）は未実装**で、`appSlugs` の
ルールを mulmoserver に足す必要があります（凍結インフラへの 2 回目のデプロイ）。

---

## ステップ 5 — 他の人が使う

### 公開ページ

```
https://<host>/sakura-hair
```

Web は `appSlugs/sakura-hair` から aid を引き、`apps/{aid}/config/public` を読んで
ページを描きます。**未ログインでも読めます**（`config` だけが `allow read: if true`）。

### 誰が何をできるか

| 相手 | 何をするか | 認可 |
|---|---|---|
| **お客さん** | 予約を申し込む | `public.submit` の宣言。`auth: "verifiedEmail"` ならメール確認済みのサインインが要る |
| **田中さん（editor）** | 予約を承認する | サインイン → ルールが `members` からロールを引く |
| **あなた（owner）** | 全部 + publish | 同上 |

**MulmoTerminal は要りません。** ルールが `request.auth.token.email` を `members` に
突き合わせるので、認可はサーバー側（Firestore）で完結します。

**実装状況**: ルールは deploy 済みで動く。**Web ページ自体が未実装**（実装順 9 / 12）。

---

## まとめ — どこに何があるか

| | ローカル（git） | Firestore |
|---|---|---|
| **スキーマ** | `.claude/skills/<slug>/schema.json` | `apps/{aid}/collections/{slug}` の `publishedSchema` |
| **名簿・公開設定** | `app.json` | `apps/{aid}` / `apps/{aid}/config/public` |
| **URL の予約** | `app.json` の `slug` | `appSlugs/{slug}` |
| **レコード** | — | `apps/{aid}/collections/{slug}/items/*` |

**git のものが正**で、Firestore は publish が作った**射影**です。逆流はしません。

---

## 実装状況（2026-08-11）

| | 状態 |
|---|---|
| コレクション作成 / 名簿 / publish の本体 | **動く**（`@mulmoclaude/core` 3.8.0、ルールは本番へ deploy 済み） |
| `aid` の UUID 自動生成 | **未実装**（決定済み） |
| URL slug の確保 + `appSlugs` のルール | **未実装**（決定済み。ルールの 2 回目のデプロイを含む） |
| 「共有と非共有を混ぜない」規則 | **未実装**（決定済み） |
| **MulmoTerminal から使えること** | **未実装** — Firestore のセッションを繋いでいない。**いま繋がっているのは MulmoClaude だけで、そちらは設計上サポート対象外**（D5） |
| MulmoClaude のワークスペースでの拒否 | **未実装**（決定済み） |
| Web の公開ページ | **未実装**（実装順 9 / 12） |

**既知の穴**: 同時に 2 人が publish すると版が混ざりうる（mulmoclaude#2866）。
publish は手動・低頻度なので当面は受容。
