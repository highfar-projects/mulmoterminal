# feat: 共有コレクション（shareable collection）

**Status**: 計画（未実装）

> ### 検証の状態 — 読む前に
>
> このプランは **4 巡の静的レビュー**（codex 3 巡・Gemini 1 巡）を経て **14 件**の欠陥を修正
> している。**そのすべてが「読む限り正しく見えるルール」だった。** うち 10 件は同一原因
> （任意キーの無ガード参照）で、**規律として明文化した後の巡回でも再発した。**
>
> **ルールは一度も実行されていない。** 静的判定はこの設計に対して 4 回連続で外れており、
> 5 回目の「異常なし」も同じ方法である限り正しさの証拠にならない。
>
> したがって:
> - **ここに書かれた Firestore ルールは、動作未確認の設計案である。** そのまま
>   `../mulmoserver` にデプロイしない
> - **実装順ステップ 2 の emulator テストは形式ではなく本体。** 4 シナリオを通すだけでなく、
>   「同じ形のバグが 3 巡続いた（4 巡目も同じだった）」に挙げた 4 パターンを必ず含める
> - 外部レビューの「承認」を根拠にステップ 3 以降へ進まない。**承認したのは読んだ人であって、
>   動かした人ではない**
**日付**: 2026-08-10
**関連**: mulmoclaude #2196 / #2197 / PR #2209（ドラフト、Firestore store）、`../mulmoserver`（Firestore ルール）

---

## 何を作るのか

**リポジトリにコミットされた宣言から、ログイン不要で誰でも使える Web アプリを、コードを書かずに公開できるようにする。**

想定シナリオ（設計の全判断はここから導かれる）。**2 つあるのは、突く軸が重ならないから**:

**シナリオ 1 — 美容室の予約サイト**（軸: リソース × 時間 × 承認 × 副作用）

> 美容室のオーナーと美容師が数人。美容師の勤務時間はオーナーが入力する。それが予約表として
> Web に公開され、**誰でも**予約を申し込める。サービスの種類によって所要時間が異なる。
> オーナーまたは美容師が承認すると、申込者に承認メールが届く。

**シナリオ 2 — Web アンケート**（軸: 一人一回 × 書き切り × 期限 × 集計）

> 質問をいくつか用意し、**ログインした上で**答えてもらう。同じ人は 1 回しか答えられない。
> 締切がある。結果は集計して見せたい（ただし個々の回答は本人以外に見せない）。

**シナリオ 3 — オンライン授業の演習**（軸: ライブ × 段階的公開 × 非対称な可視性）

> 先生が生徒に三択問題を**1 問ずつ**提示する。生徒は Web から回答し、答えが揃ったところで
> 先生が正解を教えながら**正答率を見せる**。全問終わると、**先生には全生徒の成績が見え、
> 生徒には自分の成績＋全体統計だけが見える。**

**シナリオ 4 — 議会の投票**（軸: 記録の完全性 × 公開性 × ライブ集計）

> 参加者がトピックごとに賛成・反対を投じ、**結果がリアルタイムでグラフ表示される**。
> 議長がトピックを切り替えると、議員のページも自動的にそのトピックへ進む。
> **戻って投票先を変えることはできない。**

4 つは要求がほとんど重ならない。**4 つとも宣言だけで書ける範囲が、この製品の宣言的表面の下限**になる。

軸の対比:

| | 軸 | 時間 | 他人の回答 | 一番大事なもの |
|---|---|---|---|---|
| 1. 美容室 | リソース × 承認 × 副作用 | 非同期 | 見えない | 到達性（誰でも申し込める） |
| 2. アンケート | 一人一回 × 書き切り × 期限 | 非同期 | 見えない | プライバシー |
| 3. 授業 | ライブ × 段階的公開 × 非対称 | **今** | 見えない | **秘匿**（正解が漏れない） |
| 4. 議会 | 記録の完全性 × 公開性 | **今** | **見える** | **改竄されないこと** |

**シナリオ 3 と 4 は正反対**である点が重要。3 は「隠す」ことが要件、4 は隠すことがむしろ間違い。
同じ機構で方針が逆になるので、**方針は宣言で持たせるしかない。**

> **これらはサンプルであって、システムの仕様ではない。** システムは汎用に作る。
> 4 つは「宣言言語がどこまで表現できなければならないか」を決めるための負荷試験であり、
> 同時に**テンプレートとして同梱**して LLM の参照先にする（「テンプレートとスキーマリンター」参照）。

「誰でも」の強さは**アプリごとの宣言**とする（下の「申込みの認証段階」）。サロンは非ログインで
始めたいかもしれないが、社内の会議室予約なら迷わずログイン必須にすべきで、同じ機構の上で
答えが逆になる。**ルールは凍結インフラなので 3 段階とも最初に入れる。**

このとき:

- 客は一度も AI に会わない。サインインもしない。ただの予約サイトを使う
- オーナーの Mac は**稼働している必要がない**
- アプリの定義は git にあり、diff がレビューでき、履歴と巻き戻しが効く

## なぜこの形なのか（テーゼ）

既存の AI アプリビルダーの成果物は、プラットフォーム内の不透明な状態か、フルのコードベース。
**React のコードベースの diff を人間は承認しない。** `schema.json` の diff は 30 秒で読める。

> **宣言的で狭いことは制約ではなく、エージェントに書かせても統治できる唯一のスケールである。**

そして統治の道具を新規発明しない — git、PR、diff、履歴、rollback、deploy をそのまま借りる。
AI 専用の安全機構は 1 つも要らない。

主張は「AI がアプリを作る」ではなく **「AI が作ったアプリを、既存のエンジニアリング文化が
そのまま統治する」**。

もう 1 つの形: **スキルとアプリが同一の成果物である。** 同じ 1 つのドキュメントが、
エージェントには「このデータの扱い方」を教え、人間には UI を描く。片方は LLM を含むランタイム、
もう片方は含まないランタイム。定義は 1 つ。

---

## 前提として確認済みの事実

調査で確認した、設計がすでに満たしている前提。

**1. MT のプロジェクトスコープは「リポジトリにコミットされた定義」として設計済み**
（`server/backends/collections.ts:104-158`）

> `~` と project は separate worlds。`~/.claude/skills` の下の collection は
> *a machine-global thing no clone of a repository can have* … a stray file would shadow
> **the committed skill**, and it is a second copy of the definition in
> **a repo that is supposed to be self-contained**

`projectSkillsDir` = `<root>/.claude/skills`、`userSkillsDir` と `skillsStagingDir` は
プロジェクトルートでは `null`。**git 管理は後付けの要件ではなく、既に満たされている前提。**

**2. MT は explicit-root モードのマルチルートホスト**（同 `workspaceRoot: null`、
`server/infra/project-root.ts`）。1 プロジェクト = 1 ルート。MulmoClaude は単一ワークスペース。

**3. コレクションの同一性は現在 `(root, slug)`**
（`@mulmoclaude/core/collection/server/host.d.ts` の INVARIANT）

> a slug is unique within a root and nowhere else. A collection's identity is `(root, slug)`.
> Anything keyed by slug ALONE — a cache, a pubsub channel, a view token, a notification id,
> a rendered card — is a cross-root collision waiting to happen.

**共有コレクションには root がない**（相手のマシンにも Web にも存在しない）。ここが変更の核心。

**4. `CollectionStore` に `watch` が既にあり、`StoreChange` は `item` / `collection` の粒度を持つ**
→ `onSnapshot` の `docChanges()` にそのまま対応する。

**5. Firestore ルールは `../mulmoserver` にあり、MC/MT からは変更できない**
（cross-repo の PR + デプロイ）。**実質的に凍結されたインフラとして設計する必要がある。**

---

## 設計判断

### D1. 共有の単位は「コレクション」ではなく「アプリ（= リポジトリ）」

美容室シナリオは 4 コレクション（stylists / services / shifts / bookings）が
**1 つのメンバー表と 1 つの公開設定を共有**する。招待を 4 回やらせるのは論外。

```
apps/{aid}                               メンバー、公開設定、publish 情報
apps/{aid}/collections/{cid}             publish されたスキーマ + ビュー
apps/{aid}/collections/{cid}/items/{id}  レコード
```

**リポジトリ = アプリ = 共有の単位。** `aid` はリポジトリ内にコミットされるので、
clone した全員が同じアプリを指す（招待は「見つけるため」ではなく「認可のため」だけになる）。

### D2. 同一性は `(root, slug)` から `(aid, cid)` へ

D1 の帰結。engine の INVARIANT が列挙したもの — キャッシュ、pubsub チャンネル、ビュートークン、
通知 id、描画されたカード — が**すべて対象**。ストア実装の中に閉じない変更であり、
**最初に通すのが正しく、後から通すのが最も高い。**

**2 つの同一性は共存する**（ローカルコレクションは一切変えない、が前提）。したがって engine 側は
片方に寄せるのではなく、**判別可能なユニオン**にする:

```ts
export type CollectionKey =
  | { kind: "local";  root: string; slug: string }
  | { kind: "shared"; aid: string;  cid: string };
```

INVARIANT が列挙したものは**この型で鍵を持つ**。実装順 1 の中身はこの抽象化。

### D3. スキーマとビューは git、レコードは Firestore

```
git       → schema.json, views/*.html, skill テキスト   （コード。レビュー・履歴・巻き戻し）
Firestore → items/{id}                                  （データ）
```

PR #2209 の当初案（レコードだけ Firestore、スキーマはディスク）でも、検討途中の案
（スキーマも Firestore を真実にする）でもない。**コードとデータを分ける普通のやり方**に落とす。
ビューは HTML なので、そもそも git に置かれるべきものだった。

### D4. Firestore 上のスキーマは「真実」ではなく「publish された成果物」

Web サイトは git を読めないので、publish が要る。ただし**デプロイとして扱う**:

```
git (source of truth) ──publish──> apps/{aid}/collections/{cid}.publishedSchema
                                   + publishedCommit + publishedBy + publishedAt
                                   + previousPublished（rollback 用）
```

Web の見た目が古いのは「まだ publish していない」だけ、と原因が一目で分かる。

### D5. MulmoClaude はサポートしない

MC は単一ワークスペース（`~/mulmoclaude`）、MT のプロジェクトルートは separate world。
**コードを書かなくても MC は共有コレクションを見ない。** 明示するなら `acceptParsedSchema` に
1 行のゲート:

```ts
if (schema.storage?.type === "firestore" && isManagedWorkspace(workspaceRoot))
  return { ok: false, reason: "shareable collections live in a project repository, not the workspace" };
```

`isManagedWorkspace` は MT に既にある。

### D6. worktree ごとに別のデータを指せるようにする

MT の看板機能は git worktree。**同じリポジトリの worktree 2 つ = コミットされた aid が同じ =
同じ本番レコード**。feature ブランチでスキーマを変えると、チームが今使っているデータに対して
破壊的変更が走る。worktree は「安全に試すため」の機能なので期待と真逆になる。

**MT には既に答えの形がある — `worktreeEnv`**（`common/worktreeEnv.ts`。declared variable ごとに
worktree 固有の値を持つ。dev-server のポート、**データベース名**）。コレクションの aid は
まさに "a database name"。

しかも**新しい `kind` は要らない**: `WorktreeEnvVar` は
`{ kind: "port"; base } | { kind: "slug"; prefix? }`（`common/worktreeEnv.ts:51`）で、
`slug` が worktree 由来の一意な文字列を prefix 付きで作る。そのまま aid に使える。

```json
// .mulmoterminal.json
{ "worktreeEnv": { "MT_APP_SALON": { "kind": "slug", "prefix": "app_" } } }

// app.json
{ "aid": "app_7f3a", "aidEnv": "MT_APP_SALON" }
```

main の worktree は本番 aid、feature の worktree は自動で別の scratch aid。

**worktree の `aid` は Firestore にまだ存在しない、から始まる。** 明示的な手当てが要る:
新しい `aid` の `/apps/{aid}` ドキュメントは当然無いので、**worktree で最初に publish した
とき（または worktree のアプリを最初に開いたとき）に、ホストが主リポジトリの `app.json` から
`members` と公開設定を読み、新しい `aid` でシードする。** レコードは引き継がない
（引き継いだら「本番を壊さない」が嘘になる）。シードは所有者本人が実行するので
`allow create` の条件をそのまま満たす。

裏を返すと、これは目玉でもある: **エージェントが、動いているアプリの定義を、本番データを
壊さずに書き換えて試せる。** git の分岐がそのままデータの分岐になる。

### D7. ホストはビルド経路にいて、実行経路にはいない（不変条件）

| | ホスト |
|---|---|
| スキーマ/ビューをエージェントが書く | 要る |
| publish（git → Firestore） | 要る（デプロイなので当然） |
| 公開ページの表示 / 予約申込み / スマホからの承認 / 承認メール / 空き枠計算 | **不要** |

**検証方法**: publish する → ホストを落とす → サイトを一通り操作する。落ちたら漏れがある。

副産物として: オーナーの Mac が壊れてもサイトは動き続ける（定義は git、データは Firestore、
復旧は clone + サインイン）。**MulmoTerminal が無くなっても公開されたアプリは動き続ける** —
ロックインが構造的に薄い。

### D8. メンバーシップは email。Cloud Functions を使わない

uid で招待はできない（誰も自分の uid を知らない）。Firestore ルールは
`request.auth.token.email` / `email_verified` を読めるので、**招待 = members に 1 行足すだけ**で
完結する。サーバーサイドのコードはゼロ。

弱さ（メールは変わるし再利用されうる）は受け入れる。厳密にやるなら「初回アクセス時に uid を
claim する」パターンが要り、owner 限定の update に穴を開けることになる。**最初は email のみ。**

### D9. repo の権限と Firestore の members を同期しない

執行系が 2 つあり、互いを参照できない（ルールから「GitHub の write を持つか」は問えない）。
**同期させるのではなく、どちらが何の権威かを決める:**

> **repo は定義を統治する。Firestore はデータを統治する。片方がもう片方を含意しない。**

片側だけを持つ人がどちらも正当:

- **repo だけ**（メンバーではない） — スキーマを保守するが、顧客データは見るべきでないエンジニア
- **メンバーだけ**（repo アクセスなし） — **多数派**。webview から使う非エンジニア。
  この人たちに GitHub アカウントを要求してはいけない

→ **members を repo の collaborator から自動導出しない。**

---

## 権限モデル

3 つではなく、**2 軸（定義 / データ）× 読み書き + publish の 5 つ**。

|  | 読む | 書く |
|---|---|---|
| **定義**（スキーマ・ビュー） | repo read | repo write + merge |
| **定義の反映** | — | **publish**（owner のみ） |
| **データ**（レコード） | members: viewer | members: editor |

`members` は 4 値 + コレクション別（`participant` は「名指しされているが member ではない」層。
シナリオ 3 の生徒、シナリオ 2 の限定配布アンケートの対象者）:

```json
"members": {
  "owner@salon.jp":  { "*": "owner" },
  "stylist-a@x.jp":  { "bookings": "editor", "shifts": "viewer", "services": "viewer" },
  "student-1@school.jp": { "*": "participant" }
}
```

| ロール | できること |
|---|---|
| `owner` | publish、メンバー管理、`session` の駆動、削除、全件読み取り |
| `editor` | レコードの読み書き（全件） |
| `viewer` | レコードの読み取り（全件） |
| `participant` | submit + 自分の行 + public / `revealed` 済みのみ。**全件は読めない** |

> **`participant` は `members` に載るが `reader()` には含まれない。** ルールで
> 「名簿にいるか（`listed`）」と「全件読めるか（`reader`）」を混同すると、
> 参加者に全データが漏れる（「レビューで塞いだ穴」1 番）。

repo の権限（① ②）は **members に入れない**。GitHub の仕事。混ぜた瞬間に
「Firestore が repo の権限を知っている」という嘘が始まる。

### publish が唯一の危険な操作

PR をマージしても誰の画面も変わらない。publish した瞬間に全員が変わる。しかも 2 つの意味で:

1. **破壊的スキーマ変更** — フィールドの削除/rename で生きているレコードが不整合になる
2. **ビューは HTML** — **publish 権限 ≒ 全メンバーのブラウザで JS を実行する権限**

対策は既存コードで足りる:

- **publish 前にライブデータを検証する** — `validateCollectionRecords` / `recordFieldProblem`
  で「新スキーマで既存レコードが何件壊れるか」を出し、0 件でなければ確認を挟む。
  **publish がそのままマイグレーションのゲートになる**
- **publish は記名される** — 誰が・どのコミットを・いつ。前版を残して rollback 可能に

CI からの publish には owner ロールを持つサービスアカウントが要り principal の種類が増えるので、
**最初は手動 + コミットスタンプ**。

---

## Firestore ルール（静的・汎用）

**ルールは静的なまま。ACL は「ルール」ではなく「データ」にする。** コレクションが何個増えても
ルールファイルは 1 文字も変わらない。

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 署名済み（匿名認証を含む）と、検証済みメールを持つ、を分ける。
    // uid ベースの判定に verified() を要求すると匿名認証が自分の行を読めなくなる
    function authed()   { return request.auth != null; }
    function verified() { return authed() && request.auth.token.email_verified == true; }
    function email()    { return request.auth.token.email; }
    function app(aid)   { return get(/databases/$(database)/documents/apps/$(aid)).data; }

    // 名簿に載っているか（participant を含む）。「データを読める」という意味ではない
    function listed(aid) { return verified() && "members" in app(aid)
                                  && email() in app(aid).members; }

    // '*' を持たないメンバー（S1 の美容師のようにコレクション別ロールだけの人）が
    // いるので、フォールバックも `in` でガードする。無いと roleIn 自体が落ちる
    function roleIn(aid, cid) {
      return !listed(aid) ? null
           : cid in app(aid).members[email()] ? app(aid).members[email()][cid]
           : '*' in app(aid).members[email()] ? app(aid).members[email()]['*']
           : null;
    }
    // どれか 1 つでも書き手ロールを持つか（コレクション別ロールだけの人を弾かないため）
    function writerOf(aid, cid) { return roleIn(aid, cid) in ["owner", "editor"]; }
    // 全件を読める役割。participant は決して含まれない
    function reader(aid, cid) { return roleIn(aid, cid) in ["owner", "editor", "viewer"]; }

    // --- 任意キーは必ず `in` でガードしてから読む（規律。理由は本文「同じ形のバグが3巡続いた」）
    function hasPub(aid)          { return "public" in app(aid); }
    function publicOn(aid)        { return hasPub(aid) && "enabled" in app(aid).public
                                           && app(aid).public.enabled == true; }
    function publicRead(aid, cid) { return publicOn(aid) && "read" in app(aid).public
                                           && cid in app(aid).public.read; }
    function partRead(aid, cid)   { return listed(aid) && "participantRead" in app(aid)
                                           && cid in app(aid).participantRead; }
    function hasCol(aid, cid)     { return "collections" in app(aid) && cid in app(aid).collections; }
    function colFlag(aid, cid, k) { return hasCol(aid, cid) && k in app(aid).collections[cid]; }
    function immutableCol(aid, cid) { return colFlag(aid, cid, "immutable")
                                           && app(aid).collections[cid].immutable == true; }
    function rollCall(aid, cid)     { return colFlag(aid, cid, "peerVisibility")
                                           && app(aid).collections[cid].peerVisibility == "public"; }
    function gatedCol(aid, cid)     { return colFlag(aid, cid, "revealGated")
                                           && app(aid).collections[cid].revealGated == true; }

    match /apps/{aid} {
      function membersConsistent() {
        return request.resource.data.memberEmails.toSet()
            == request.resource.data.members.keys().toSet();
      }

      // 名簿そのものは reader だけ。participant に読ませると同級生のメールが見える。
      // ルールの get() は read ルールの影響を受けないので、これで判定は壊れない
      allow read:   if reader(aid, '*');
      allow create: if verified()
                    && request.resource.data.owner == request.auth.uid
                    && email() in request.resource.data.members
                    && '*' in request.resource.data.members[email()]
                    && request.resource.data.members[email()]['*'] == "owner"
                    && membersConsistent();
      allow update: if roleIn(aid, '*') == "owner"
                    && request.resource.data.owner == resource.data.owner
                    && membersConsistent();
      allow delete: if roleIn(aid, '*') == "owner";

      // participant / 匿名が読む公開設定（名簿を含まない）。owner が publish 時に書く
      match /config/{docId} {
        allow read:  if true;
        allow write: if roleIn(aid, '*') == "owner";
      }

      // 主催者が駆動する状態機械（シナリオ 3 / 4）。
      // writerOf は editor を含むので、それだと editor が phase を revealed にして
      // 正解を開示したり、投票を勝手に開閉したりできる。ロール表どおり owner のみ
      match /session {
        allow read:  if listed(aid) || publicOn(aid);
        allow write: if roleIn(aid, '*') == "owner";
      }

      match /collections/{cid} {
        allow read:  if reader(aid, cid) || publicRead(aid, cid) || partRead(aid, cid);
        allow write: if roleIn(aid, '*') == "owner";     // = publish

        match /items/{itemId} {
          function submitOpen() { return hasPub(aid) && "submit" in app(aid).public
                                         && cid in app(aid).public.submit; }
          function cfg()        { return app(aid).public.submit[cid]; }
          function has(k)       { return submitOpen() && k in cfg(); }
          function session()    { return get(/databases/$(database)/documents/apps/$(aid)/session).data; }

          // 親（gatedFrom）の同 id を見る。exists() を挟まないと未作成時に評価が落ちる
          function gatedParent(aid, cid, itemId) {
            return /databases/$(database)/documents/apps/$(aid)/collections/$(app(aid).collections[cid].gatedFrom)/items/$(itemId);
          }
          function gatedRevealed(aid, cid, itemId) {
            return "gatedFrom" in app(aid).collections[cid]
                && "revealBy" in app(aid).collections[cid]
                && exists(gatedParent(aid, cid, itemId))
                && app(aid).collections[cid].revealBy in get(gatedParent(aid, cid, itemId)).data
                && get(gatedParent(aid, cid, itemId)).data[app(aid).collections[cid].revealBy] == true;
          }

          function authMode() { return has("auth") ? cfg().auth : "none"; }
          function authOk() {
            return authMode() == "none"
                || (authMode() == "anonymous" && authed())
                || (authMode() == "verifiedEmail" && verified()
                    && (!has("emailField")
                        || request.resource.data[cfg().emailField] == email()));
          }

          // ID 戦略は有限の enum。文字列連結で複合 ID を検証する
          function idOk() {
            return !has("idFrom")
                || cfg().idFrom == "auto"
                || (cfg().idFrom == "auth.uid" && authed() && itemId == request.auth.uid)
                || (cfg().idFrom == "auth.uid+field" && authed() && has("idField")
                    && cfg().idField in request.resource.data
                    && request.resource.data[cfg().idField] is string
                    && itemId == request.auth.uid + "_" + request.resource.data[cfg().idField]);
          }
          // ルールは文字列を timestamp に暗黙変換しない。ISO 文字列と request.time を
          // 比較すると型エラーで fail closed になるので、publish が epoch millis
          // （数値）に落としたものを見る（下記「authored と published は別物」）
          function inWindow() {
            return !has("window")
                || (request.time.toMillis() < cfg().window.untilMs
                    && (!("fromMs" in cfg().window)
                        || request.time.toMillis() > cfg().window.fromMs));
          }
          function curStatus()  { return has("statusField") && cfg().statusField in resource.data
                                  ? resource.data[cfg().statusField] : null; }
          function nextStatus() { return has("statusField")
                                       && cfg().statusField in request.resource.data
                                  ? request.resource.data[cfg().statusField] : null; }
          function changed()    { return request.resource.data.diff(resource.data).affectedKeys(); }

          // 宣言された状態遷移は **誰に対しても** 効く。writer は無条件に書ける、では
          // アクションの `require`（pending からのみ承認できる）が助言になり、
          // cancelled の予約をいきなり approved にできてしまう
          function tGraph() { return app(aid).collections[cid].transitions; }
          // null を「素通り」にしてはいけない。status を消せると、消してから
          // 任意の状態に入れて状態機械を丸ごと迂回できる（2 手で pending を経由せず
          // approved に到達する）。したがって:
          //   - status を消す / null にする書き込みは拒否（nextStatus() != null）
          //   - すでに status を持たない既存レコード（取り込み等）は、
          //     **宣言された復帰口 `initial` にだけ**入れる
          function transitionOk() {
            return !colFlag(aid, cid, "transitions") || !has("statusField")
                || (nextStatus() != null
                    && (curStatus() == nextStatus()
                        || (curStatus() != null && curStatus() in tGraph()
                            && tGraph()[curStatus()].hasAny([nextStatus()]))
                        || (curStatus() == null && "initial" in tGraph()
                            && tGraph().initial.hasAny([nextStatus()]))));
          }

          // 匿名認証でも自分の行には届く（uid 判定に verified を要求しない）
          function ownRow() {
            return authed() && submitOpen()
                   && (itemId == request.auth.uid
                       || itemId.matches(request.auth.uid + "_.*")
                       || (verified() && has("emailField")
                           && cfg().emailField in resource.data
                           && resource.data[cfg().emailField] == email()));
          }

          allow read: if reader(aid, cid)
                      || publicRead(aid, cid)
                      || partRead(aid, cid)
                      // 記名投票: 名簿にいる全員が全件読める
                      || (rollCall(aid, cid) && listed(aid))
                      // 段階的公開: フラグの真実は「親」の側にある。gated が生成した
                      // 従属ドキュメントは correctChoice / explanation しか持たないので、
                      // ここで resource.data.revealed を見ると永久に false になる。
                      // 親が未作成・削除済みだと get().data が例外になるので exists() が要る
                      || (gatedCol(aid, cid) && listed(aid) && gatedRevealed(aid, cid, itemId))
                      // 自分の行だけ（participant はここまで）
                      || ownRow();

          allow create: if writerOf(aid, cid)
                        || (submitOpen()
                            // 匿名（auth: "none"）で開くならマスタースイッチも要る
                            && (authMode() != "none" || publicOn(aid))
                            && has("createFields")
                            && request.resource.data.keys().hasOnly(cfg().createFields)
                            && request.resource.data.size() <= 200
                            // 名前だけでなく「必須が揃っているか」と、整合性上重要な
                            // 1 つの enum を検査する（ルールには反復が無いので、
                            // 任意スキーマの型検査はここまでが限界。下記参照）
                            && (!has("validate")
                                || ((!("required" in cfg().validate)
                                     || request.resource.data.keys().hasAll(cfg().validate.required))
                                    && (!("choiceField" in cfg().validate)
                                        || (cfg().validate.choiceField in request.resource.data
                                            && cfg().validate.choiceValues
                                                 .hasAny([request.resource.data[cfg().validate.choiceField]])))))
                            && (!has("statusField")
                                || (cfg().statusField in request.resource.data
                                    && has("initialStatus")
                                    && request.resource.data[cfg().statusField] == cfg().initialStatus))
                            && authOk()
                            // `!= null` だと viewer / editor まで投稿できてしまう。
                            // 宣言した audience と認可を一致させる
                            && (!has("audience") || cfg().audience != "participant"
                                || roleIn(aid, cid) == "participant")
                            && idOk() && inWindow()
                            && (!has("gateOn")
                                || (session().phase == cfg().gateOn.phase
                                    && session().current
                                         == request.resource.data[cfg().gateOn.match])));

          // immutable なら誰も（owner でも）更新できない。
          // 本人の更新は「変わったキーが selfUpdate[現在の状態] の範囲」— ドキュメント全体の
          // hasOnly ではない。status のような system field は差分に現れた時点で拒否される。
          // 宣言された状態遷移（キャンセル等）だけは status の変更を許す
          allow update: if !immutableCol(aid, cid)
                        && transitionOk()
                        && (writerOf(aid, cid)
                            || (ownRow() && !(has("finalize") && cfg().finalize == true) && inWindow()
                                // 本人が触ってよいフィールドは **現在の状態ごと** に宣言する。
                                // 平坦なリスト（状態を見ない selfUpdate）だと、承認済みの予約の startAt を
                                // 客が黙って動かせる（枠が移り、承認し直されない）
                                && ((has("selfUpdate") && curStatus() != null
                                     && curStatus() in cfg().selfUpdate
                                     && changed().hasOnly(cfg().selfUpdate[curStatus()]))
                                    // 宣言された本人遷移（キャンセル等）
                                    || (has("selfTransitions") && curStatus() != null
                                        && changed().hasOnly([cfg().statusField])
                                        && curStatus() in cfg().selfTransitions
                                        && cfg().selfTransitions[curStatus()]
                                             .hasAny([nextStatus()])))));

          allow delete: if !immutableCol(aid, cid) && writerOf(aid, cid);
        }
      }

      // 宣言的な副作用のキュー（Firebase Trigger Email 拡張が読む）。
      // '*' ロールを持たない人（コレクション別 editor の美容師）が承認メールを
      // 出せなくなるので、そのアクションが属する cid の書き手も通す
      match /mail/{mailId} {
        function m()       { return request.resource.data; }
        function mailCfg() { return app(aid).collections[m().cid].mail; }
        function srcItem() {
          return /databases/$(database)/documents/apps/$(aid)/collections/$(m().cid)/items/$(m().itemId);
        }
        // 宛先とテンプレートを縛るだけでは足りない。それだけだと書き手は、
        // どんな状態の予約に対してでも `booking-approved` を何度でも積める。
        // つまり「承認したから送る」というアクションと遷移が助言にとどまる。
        // 2 つで縛る:
        //   - 決定的な mailId → 同じアクションを二度積めない（create は 1 回しか通らない）
        //   - get() が `from` に入り getAfter() が `to` である → **この書き込みが、
        //     宣言された遷移を行った**こと。to だけでは (a) すでに approved の記録に
        //     何も書かずメールだけ積める (b) cancelled から直接 approved にして送れる
        // クライアントは記録の更新とメールの enqueue を 1 つのバッチで書く必要がある
        allow create: if listed(aid)
                      && m().keys().hasAll(["cid", "itemId", "to", "template"])
                      && m().keys().hasOnly(["cid", "itemId", "to", "template", "data"])
                      && hasCol(aid, m().cid) && "mail" in app(aid).collections[m().cid]
                      && writerOf(aid, m().cid)
                      && mailId == m().cid + "_" + m().itemId + "_" + m().template
                      && exists(srcItem())
                      && mailCfg().toField in get(srcItem()).data
                      && get(srcItem()).data[mailCfg().toField] == m().to
                      && m().template in mailCfg().on
                      && mailCfg().statusField in get(srcItem()).data
                      && mailCfg().statusField in getAfter(srcItem()).data
                      // 遷移「先」だけでなく「元」も宣言どおりであること。
                      // to だけだと cancelled/rejected から直接 approved にして
                      // booking-approved を送れる（アクションの require を迂回する）
                      && mailCfg().on[m().template].from
                           .hasAny([get(srcItem()).data[mailCfg().statusField]])
                      && getAfter(srcItem()).data[mailCfg().statusField]
                           == mailCfg().on[m().template].to
                      && (!("data" in m()) || m().data.keys().hasOnly(mailCfg().dataFields));
        allow read, update, delete: if false;
      }
    }

    match /{document=**} { allow read, write: if false; }
  }
}
```

`delete` を `write` から分けているのは、削除時に `request.resource` が null になり
サイズ判定が壊れるため。

### レビューで塞いだ穴（記録）

初稿のルールには 3 つの実害ある欠陥があった。**同じ間違いが再発しやすいので残す。**

**1. `participant` が全件を読めていた。** `member(aid)` を「名簿にいるか」と定義し、item の read を
`member(aid)` で許していた。`participant` も名簿（`members`）に載るので、**生徒が同級生の回答を、
回答者が他人のアンケートを読めた。** シナリオ 2 と 3 の前提が崩れる。
→ **`listed()`（名簿にいる）と `reader()`（全件読める役割）を分離。** `participant` は
`reader()` に決して含まれない。名簿に載っていることと、データを読めることは別。

**2. 申込者が自分の予約を `approved` にできた。** `status` は create 時に `initialStatus` を
検証するため `fields` に必要だが、更新規則が**同じ `fields` に対する `hasOnly`** だったため、
本人が `status` を書き換えられた。**これは権限昇格。**
→ **`createFields` と `selfUpdate` を分離**し、更新は
`diff(resource.data).affectedKeys().hasOnly(selfUpdate[現在の状態])` で**変わったキー**を見る。
状態遷移は `selfTransitions` で宣言されたものだけ許す。

> この欠陥は**下のリンター表に自分で書いた項目そのもの**（「管理用フィールドが
> 混ざっている → 権限昇格」）。設計者が自分の検査項目を自分のサンプルで破った。
> **リンターが要るという主張の、これ以上ない裏付け。**

**3. 複合 ID が表現できていなかった。** `idFrom` があれば `itemId == request.auth.uid`、という
単一の規則だった。シナリオ 3・4 は `{uid}_{questionId}` を要求するので、**全問・全議題で
1 ドキュメントしか作れない**（＝ 2 問目以降が投稿できない）。
→ **`idFrom` を有限の enum** にし、`"auth.uid+field"` + `idField` を文字列連結で明示的に検証する。

**4. `auth` を boolean にしていたため、S2/S3/S4 の投稿が全部拒否されていた（2 巡目）。**
`requireAuth: true` のとき `data[cfg().emailField] == email()` を必須にしていたが、
アンケート・小テスト・投票は `emailField` を宣言しない。ルールが存在しないキーを参照して落ち、
**create が常に失敗する。** 同じ理由で `ownRow()` も落ちていた。
→ **`auth` を有限 enum（`none` / `anonymous` / `verifiedEmail`）** にし、email の一致強制は
`emailField` を宣言したときだけに切り離した。ついでに段階 B（匿名認証）が
boolean では表現できていなかったことも解消した。

**5. `gated` の公開が永久に効かなかった（2 巡目）。** 読み取り条件を
`resource.data.revealed == true` にしていたが、**生成される従属ドキュメントは
`correctChoice` と `explanation` しか持たない。** 正解を明かしても生徒に届かない。
→ **親（`gatedFrom`）の同じ id を `get()` してフラグを見る。** フラグの真実は親にしかない。

**6. `public.enabled` が何もゲートしていなかった（2 巡目）。** read は
`cid in public.read` だけを見ていたので、`enabled: false` でも匿名で読めた。
S3 は `enabled: false` のまま `questions` / `stats` を `public.read` に置いており、
**授業の問題が誰でも読める状態だった。**
→ `publicOn()` をマスタースイッチにし、名簿にいる人に開くための
**`participantRead` を別に用意**した（participant は `reader()` ではないので、これが無いと
生徒が問題文すら読めない）。

**7. 任意キーを無ガードで読んでいた（3 巡目）。** `partRead()` は
`cid in app(aid).participantRead` を見るが、S1/S2 はそのキーを宣言していない。
同じ形が `app(aid).collections[cid]`（`immutable` / `peerVisibility` / `revealGated`）、
`cfg().audience`、`cfg().selfUpdate`、`cfg().selfTransitions` にもあった。
**存在しないキーを読むとルールが落ち、自分の予約・自分の回答すら読めなくなる（fail closed）。**
→ **任意キーは必ず `in` でガードしてから読む**という規律に統一し、
`hasPub` / `hasCol` / `colFlag` / `has(k)` を用意した。サンプルの `app.json` にも
`collections` と `participantRead` を明示した。

**8. 匿名認証（段階 B）が自分の行を読めなかった（3 巡目）。** `ownRow()` が `signedIn()` を
要求し、`signedIn()` は `email_verified == true` を要求していた。**匿名認証にメールは無い**ので、
uid でキーした自分の投稿すら読めない。認証段階の表は「B は uid ベースなら可」と書いていたので、
**表と実装が矛盾していた。**
→ **`authed()`（署名済み・匿名を含む）と `verified()`（検証済みメール）を分離。**
uid ベースの判定は `authed()`、メール比較だけ `verified()`。

**9. 語彙のドリフト（3 巡目）。** 本文は `auth` / `createFields` / 既存の `when` に移行したのに、
断片・リンター表・シナリオ表に `requireAuth` / `submit.fields` / `showIf` /
`currentQuestion` / `currentTopic` が残っていた。**このプランは LLM の参照物なので、
古い語彙が残ることは仕様の二重化そのもの。** → 全て現行語彙に統一（`session` のキーは
`current` に一本化）。

**10. `roleIn()` 自身が無ガードだった（4 巡目）。** `'*'` ロールを持たないメンバー
（S1 の美容師は `{bookings: editor, shifts: viewer, services: viewer}` だけ）に対して
フォールバック `members[email()]['*']` を読むので、**`roleIn` の呼び出しが落ちる**。
症状として最初に見えたのは「美容師が承認してもメールが出ない」（`/mail` の `writerOf(aid,'*')`）
だが、原因は `/mail` ではなく**最も中心の関数**。
→ フォールバックも `in` でガードし、`writerOf(aid, cid)` に一本化。`/mail` は
`request.resource.data.cid` の書き手も通す。

**11. `get().data` を `exists()` なしで読んでいた（4 巡目）。** gated の親が未作成・削除済みだと
評価が落ちる。→ `exists()` を挟み、`revealBy` のキー存在も確認する。

**12. 複合 ID の材料を無検査で連結していた（4 巡目）。** `request.resource.data[cfg().idField]` が
無い、あるいは文字列でないと、連結が型エラーで落ちる。→ キー存在と `is string` を確認。

**13. `members[email()]` をアプリ作成時に無ガードで読んでいた（4 巡目）。**
→ `email() in request.resource.data.members` と `'*' in ...` を先に確認。

**14. ドキュメント側のキー存在を確認していなかった（4 巡目）。** `cfg().emailField` /
`cfg().statusField` が**宣言されていても、そのレコードに無い**ことがある。
→ `resource.data` / `request.resource.data` 側の存在も確認する。

**15-17. CI レビュー（5-6 巡目）。**

- **`/mail` の縛りが半分だった。** 宛先とテンプレートを固定しても、書き手は
  **どんな状態の記録にでも、何度でも**通知を積めた。アクションと遷移が助言のまま。
  → 決定的な `mailId` で重複を封じ、`get() != getAfter()` で**この書き込みが遷移させたこと**を
  要求。**7 巡目の追撃**: `getAfter()` だけでは「結果その状態である」しか言えず、すでに
  `approved` の予約に何も書かずメールだけ積めた。前後の差を見て初めて
  「送るなら、この書き込みで承認していなければならない」になる
- **`audience: "participant"` が `roleIn(...) != null` だった。** viewer や editor まで
  投稿できる。読み取り専用のつもりで viewer を配ると、その人が投票できてしまう。
  → 厳密一致に
- **S2 のサンプルが `audience` を宣言しながら `members` を持っていなかった。**
  `listed()` が偽になり**アンケートの投稿が全部拒否される**。
  → S2 は `audience` を外す（ログインした人なら誰でも）形に直し、
  名指し配布にする場合の書き方を併記

**19. `window` の ISO 文字列を `request.time` と比較していた（8 巡目）。**
ルールは文字列を timestamp に暗黙変換しないので、型エラーで**アンケートの投稿が全部拒否**。
→ publish が epoch millis（`fromMs` / `untilMs`）に落とし、ルールは
`request.time.toMillis()` と比較する。**あわせて、サンプルが示しているのは
authored な `app.json` であって published な `apps/{aid}` ではない**ことを明記した
（この取り違えが指摘の根にあった）。

**20-21. 宣言された状態機械をルールが持っていなかった（9 巡目）。** 2 件は同じ根。

- **メールが遷移「先」しか見ていなかった。** `writerOf` は無条件に item を更新できるので、
  書き手は `cancelled` / `rejected` の予約を**同じバッチで直接 `approved` に飛ばして**
  `booking-approved` を送れた。アクションの `require`（pending からのみ承認できる）が
  ルールに存在しなかった。
  → `mail.on` を `{from: [...], to: "..."}` にし、**遷移元も宣言どおり**であることを要求。
  さらに `collections[cid].transitions` を publish が出し、**writer を含む全員に**
  状態機械を効かせる
- **客が承認済みの予約を黙って動かせた。** `selfUpdate` が平坦なリストで、現在の状態を
  見ずに `startAt` / `stylist` を許していた。承認済みの予約が別の時間帯に移り、
  `schedule` の busy 判定だけが更新され、**担当者は承認し直していない。**
  → `selfUpdate` を**状態別**にし、`approved` では名前しか触れない
  （動かしたければキャンセルして取り直す）

**共通の教訓**: `require` も `then` も `selfTransitions` も、**publish が
`transitions` に落として初めてルールが効く。** 落とさなければ宣言は助言のまま。

**22. S3/S4 のテンプレートが `memberEmails` を欠いていた（10 巡目）。**
ルートの app ルールは `membersConsistent()`（`memberEmails` == `members.keys()`）を
create/update で要求するので、**コピーしたそのままでは publish できない**。
しかも直前の巡回で S2 に「`members` と `memberEmails` を必ず一緒に宣言する」と書いており、
**二重管理を人に課す方向で塞いでしまっていた。**
→ 逆にした。**`memberEmails` は authored な `app.json` に書かない**。`members` からの
純粋な導出で、`members` を書く経路（publish と招待 UI）が生成する。
`membersConsistent()` は**ずれを書き込めなくする不変条件**であって、人への要求ではない。
S1 のサンプルからも手書きの `memberEmails` を外した。

> ここまでの 3 巡と同じ形に見えるが、向きが逆。**「publish が落としていない宣言」ではなく、
> 「publish が生成すべき導出物を人に書かせていた」。** どちらも
> 「authored と published の境界が曖昧」という同じ原因から出ている。

**23-24. 状態機械の 2 つの抜け道（11 巡目）。**

- **`session` を editor が駆動できた。** `writerOf(aid, '*')` は editor を含むので、
  ロール表が「owner のみ」と書いている `session` を editor が動かせた。
  **`phase: "revealed"` にして正解を開示**したり、投票を勝手に開閉したりできる。
  → `roleIn(aid, '*') == "owner"` に。
- **status を消せば状態機械を迂回できた。** `transitionOk()` の
  `curStatus() == null || nextStatus() == null` は**ガードのつもりが素通り口**で、
  1 手目で status を消し、2 手目で任意の状態に入れば **pending を経由せず approved
  に到達**する。
  → status の削除／null 化を拒否し（`nextStatus() != null`）、すでに status を持たない
  既存レコードは**宣言された復帰口 `initial` にだけ**入れる。

> 2 つ目が今回の教訓。**「null なら素通り」という書き方は、ガードの顔をした穴。**
> 3 巡目から「任意キーは `in` でガードする」と言ってきたが、
> **ガードした先を `true` に倒すか `false` に倒すか**は別の判断で、
> 状態機械では `false`（拒否）が正しい。emulator テストに
> 「status を消す書き込み」を必ず入れる。

### 同じ形のバグが 3 巡続いた（4 巡目も同じだった）

**4 巡で 10 件が同じ根っこ**だった:

> **ルールを「サンプルに書いたキー」に対して書いており、「宣言言語の任意性」に対して
> 書いていなかった。**

`emailField` を宣言しないアプリ、`participantRead` を持たないアプリ、`collections` に
エントリの無いコレクション — どれもサンプルの外側にあり、机上では見えない。
**Firestore ルールでは存在しないキーの参照が fail closed になるので、症状は
「権限エラー」ではなく「なぜか何も出ない」になる。**

したがって規律を 2 つ置く:

1. **任意キーは必ず `in` でガードしてから読む。** 例外なし。
   **宣言（`cfg()` / `app()`）側だけでなく、ドキュメント（`resource.data`）側も**
2. **`get().data` の前に必ず `exists()`。** 参照先が消えているのは正常系
3. **文字列連結の材料は `is string` を確認する**
4. **emulator のユニットテストは、以下を必ず含める。**
   4 シナリオが全部通っても、これらが無いと同じ穴が開く:
   - キーを宣言しないアプリ（`public` / `collections` / `participantRead` 無し）
   - `'*'` ロールを持たないメンバー（コレクション別ロールだけの人）
   - 親が存在しない gated ドキュメント
   - 宣言されたフィールドを持たないレコード
   - **status を消す / null にする書き込み**（状態機械の迂回）
   - **global `editor` が `session` を書こうとする**

> **3 巡目でこの規律を書いた当人が、4 巡目に `roleIn()` — 最も中心の関数 — で同じことを
> していた。** 規律を書くだけでは足りず、**テストに落とすまで守られない**という証拠。

あわせて、**名簿（`members`）そのものを `participant` に読ませない**ようにした
（同級生のメールが見える）。ルールの `get()` は read ルールの影響を受けないので、
`apps/{aid}` の read を `reader()` に絞っても判定は壊れない。公開設定は
`apps/{aid}/config` に分けて置く。

### ルールが保証できること

| 保証 | どう |
|---|---|
| `memberEmails` と `members` の一貫性 | `.keys().toSet()` 比較。**ずれた状態が書き込めない**（`memberEmails` は導出物で、人は書かない） |
| 所有者が移らない | `resource.data.owner` と比較 |
| メンバー表を owner 以外が触れない | `roleIn(aid,'*') == "owner"` |
| publish が owner 限定 | collections の write が owner 限定なので自動的に満たされる |
| 申込みのフィールドと初期ステータス | `hasOnly` + 宣言された `initialStatus` |
| 申込者のなりすまし防止（C のとき） | `emailField == request.auth.token.email` を強制 |
| 申込者が他人の申込み/回答を読めない | 行レベル（`emailField == email()` / `itemId == uid`） |
| **一人一回** | `idFrom` + `allow create` が既存ドキュメントに適用されない性質 |
| **締切** | `request.time` と宣言された `window` の比較 |
| **正解の秘匿** | `gated` によるコレクション分割 + `revealed` フラグでの read 制御 |
| **カンニング防止** | `session.current` / `session.phase` を create 条件に入れる |
| **記録の改竄不可（owner を含む）** | `immutable` → `allow update, delete: if false` |
| **過去トピックへの投票を弾く** | create 条件に `session.current == topicId` |
| 巨大ドキュメントの拒否 | `request.resource.data.size()` |
| メール踏み台の防止 | 宛先は**その記録が持つアドレス**、テンプレートは**宣言された `on` のキー**のみ |
| **メールが宣言された遷移に伴っていること** | 決定的な `mailId` で重複を封じ、`get() != getAfter()` で**この書き込みが遷移させた**ことを要求 |
| 宣言した audience と認可の一致 | `roleIn(...) == "participant"`（`!= null` では viewer も投稿できる） |
| `session` を駆動できるのは owner だけ | `roleIn(aid, '*') == "owner"`（`writerOf` は editor を含む） |
| **status を消して状態機械を迂回できない** | `nextStatus() != null` を要求し、null の既存レコードは宣言された `initial` にだけ入れる |
| 公開投稿の必須と主要 enum | `hasAll(validate.required)` / `choiceValues.hasAny([...])` |

### authored な `app.json` と published な `apps/{aid}` は別物

サンプルが示しているのは**リポジトリに書く `app.json`**（人が読み書きする形）で、
Firestore の `apps/{aid}` は **publish が導出した別のドキュメント**。混同すると
「サンプルどおりに書いたのにルールが通らない」になる。

| authored（git） | published（Firestore） | なぜ変わるか |
|---|---|---|
| `window.from` / `window.until`（ISO 文字列） | `window.fromMs` / `window.untilMs`（**数値**） | **ルールは文字列を timestamp に変換しない。** ISO 文字列と `request.time` を比較すると型エラーで fail closed |
| 各コレクションの `schema.json` | `publishedSchema` + `collections[cid]`（`immutable` / `peerVisibility` / `revealGated` / `gatedFrom` / `revealBy` / `mail`） | ルールが読める平たい形に落とす |
| `actions[].then.email` | `collections[cid].mail`（`toField` / `statusField` / `on: {template: {from, to}}` / `dataFields`） | ルールが宣言を再導出できる形に |
| `actions[].require` + `set`（＋ `selfTransitions`） | `collections[cid].transitions`（`{現状態: [遷移先…]}`） | **状態機械を誰に対しても効かせる**。無いと writer が任意に飛べる |
| `members` | `members` + **`memberEmails`（導出）** | 「自分が参加しているアプリ」を `array-contains` で引くための非正規化。**人が書くものではない** — `members` を書く経路（publish、招待 UI）が必ず一緒に生成し、ルールの `membersConsistent()` がずれを拒否する |
| フィールド定義（型・required・enum） | `public.submit[cid].validate` | ルールには反復が無いので、検査できる部分集合だけ |
| — | `publishedCommit` / `publishedBy` / `publishedAt` / `previousPublished` | 記名と rollback |

**epoch millis を選び、Firestore の `Timestamp` 型にしない理由**: `app.json` は JSON で、
`Timestamp` は JSON で表現できない。数値なら authored 側も published 側も同じ形で書けて、
エージェントが生成した JSON をそのまま検証できる（サンプル節の JSON 全数検証が成り立つのも
これのおかげ）。

> **これが D4「publish はコンパイル段階である」の 3 つ目の実例。** git の宣言を、
> ルールが読める射影に落とす。**変換は必ずここに書く** — 暗黙の変換が 1 つでもあると、
> 「サンプルどおりで動かない」が再発する。

### 公開投稿の値検証は、どこまでできるか

**`hasOnly(createFields)` はフィールド「名」しか見ない。** 必須の欠落、型違い、enum 外の値、
壊れた ref は素通りする。そして**公開投稿ではクライアントが攻撃者**なので、
「3 層の検証」の第 2 層（クライアント側 `validateRecordObject`）は**存在しないのと同じ**。

**Firestore ルールには反復が無い。** `{field: type}` のマップを回して型検査する、が書けない。
したがって任意スキーマの完全な検証は**原理的に不可能**。

publish 時に**ルールで検査可能な射影**を app ドキュメントへ出し、そこまでを守る:

```json
"validate": {
  "required": ["topicId", "choice"],
  "choiceField": "choice",
  "choiceValues": ["yes", "no", "abstain"]
}
```

| 守れる | 手段 |
|---|---|
| 余分なフィールドが無い | `hasOnly(createFields)` |
| 必須が揃っている | `hasAll(validate.required)` |
| 初期ステータスが宣言どおり | `statusField == initialStatus` |
| **整合性上重要な 1 つの enum**（投票の賛否、小テストの選択肢） | `choiceValues.hasAny([...])` |
| ドキュメントが巨大でない | `data.size() <= 200` |

| 守れない | 受け方 |
|---|---|
| 任意フィールドの型 | 集計時に除外 + ホストの `validateCollectionRecords` で事後掃除 |
| 複数 enum / 文字列長 / 正規表現 | 同上。重要な 1 つだけをルールに載せる設計判断 |
| ref の実在 | `get()` が 10 回上限なので全 ref は見られない。壊れた ref は表示側で欠落として扱う |
| 大量投稿 | **App Check**（ルールにレート制限は書けない）+ `audience: "participant"` |

**設計上の含み**: 公開投稿を受けるコレクションは**検疫されたもの**として扱う。
`initialStatus` で入り、owner/editor と本人以外には見えず、**承認されるまで下流が信用しない**。
S1 の `pending → approved` はまさにそれで、S2/S3/S4 では**集計が不正レコードを除外する**。

> これは「publish はコンパイル段階である」（D4）の 2 つ目の実例。
> git のスキーマから、**ルールが読める形に落とした射影**を出す。

### ルールが保証できないこと

**1. スキーマに沿ったフィールド検証** — 動的スキーマなので不可能。3 層で受ける:

| 層 | 誰が | 何を |
|---|---|---|
| ルール | Firestore | メンバーシップ、ロール、不変フィールド、粗い形 |
| クライアント | MT / webview | `validateRecordObject`（助言的） |
| 事後 | オーナーのホスト | `validateCollectionRecords` → `recordFieldProblem` を UI に出す |

前提: **editor は「招待した信頼できる人」であって敵ではない。** 置けないなら Functions が要り、
それは mulmoserver の方針転換になる。既定を viewer にして先送りする。

**2. フィールド単位の可視性** — Firestore の読み取りは全部か無か。「viewer には金額列を見せない」を
やるなら**ドキュメント分割**しかなく、レコードが増えてからでは移設になる。

**シナリオ 3（正解の秘匿）が、これを必須にした。** → `gated` として宣言で表現し、エンジンが
分割を生成する（「ライブ・段階的公開・非対称な可視性」参照）。**やらない、という選択肢は消えた。**

### `get()` の予算と、クライアントのクエリ

- **`get()` / `exists()` は 1 リクエストあたり 10 回**（クエリは 20 回）。同一パスの重複は
  キャッシュされるので、ここで使う相異なるパスは **app ドキュメント / `session` / gated の親**の
  最大 3。余裕はあるが、条件を足すときは数える
- **`list` クエリは、ルールの条件をクライアントの `where` が写していないと通らない。**
  `ownRow()` は `resource.data[emailField]` を見るので、参加者が自分の行を一覧するには
  **`where(emailField == 自分)` を発行しなければならない**。ルールは「フィルタを補ってくれる」
  ものではなく「クエリが十分に絞られているか」を見る
  → **View Bridge の親側がクエリを組み立てるので、この規律は親の中で守り切れる。**
    生成された HTML にクエリを書かせない設計が、ここでも効く

### 注意点

- **`get()` は課金される**。単一ドキュメント要求で最大 10 回。ここでは 1 回だが、タダではない
- **匿名 create（段階 A / B）はスパムの入口**。ルールはレート制限を書けない → **App Check**
  （静的な設定）が公開フォームを持つ以上、最初から要る。段階 C でも App Check は有効だが、
  身元があるぶん事後のブロックが効く
- **このルールファイルは凍結インフラ**。ここに書けないことは製品として持てない

---

## 申込みの認証段階（`public.submit[cid].auth`）

匿名申込みを許すかは、技術ではなく**商売の判断**（ログインを要求すると一定数が離脱する）。
アプリごとに宣言し、ルールは 3 段階すべてを表現できるようにしておく。

| 段階 | `auth` | 認証 | email | 自分の申込みを見る | 濫用対策 |
|---|---|---|---|---|---|
| **A. 完全匿名** | `"none"` | なし | フォーム入力・未検証 | 不可（メール一方通行） | App Check + `public.enabled` |
| **B. 匿名認証** | `"anonymous"` | Anonymous Auth | 未検証 | uid ベースなら可 | App Check + uid |
| **C. ログイン必須** | `"verifiedEmail"` | Google 等 | **検証済み**（`emailField` を宣言したときのみ強制一致） | **可** | 身元があるのでブロック可 |

> **boolean ではなく enum である理由。** 初稿は `requireAuth: true/false` だったが、
> (1) 段階 B が表現できない、(2) `requireAuth: true` かつ `emailField` を宣言しないアプリ
> （アンケート・小テスト・投票）で**投稿が全部拒否されていた** — ルールが存在しないキーを
> 参照して落ちるため。`emailField` の一致強制は「宣言したときだけ」に切り離した。

```json
// app.json
"public": {
  "read": ["services", "shifts", "stylists"],
  "submit": { "bookings": {
      "auth": "verifiedEmail",
      "emailField": "customerEmail",
      "fields": ["customerName","customerEmail","service","stylist","startAt","status"],
      "statusField": "status", "initialStatus": "pending" } }
}
```

### C を選ぶと 3 つ得られる

1. **メールが検証済みになる** — 承認メールが届かない・打ち間違いが構造的に消える
2. **申込者が principal になる** — 行レベルのルールで「自分の申込みだけ読める」が書け、
   **「マイ予約」ページが成立する**（状況確認・キャンセル・変更）。メール一方通行だったものが
   双方向になる。**プロダクトの質が一段変わる**
3. **スパム中継の経路が閉じる** — 匿名だと、攻撃者が被害者のアドレスと攻撃的な本文で申し込み、
   承認されると**サロンのドメインから被害者に攻撃者の書いた内容が飛ぶ**。手動承認なら気づくが、
   自動承認や大量なら通る。C なら `customerEmail == request.auth.token.email` を
   **ルールで強制できる**ので穴が消える

### 失うもの

**コンバージョン。** 髪を切るのに Google アカウントを要求すると離脱がある。サロンのオーナーが
決めること。**A で始めて、迷惑予約が出たら宣言の 1 行で C に上げる**運用ができるのが要点。

---

## 一人一回・書き切り・期限・集計（シナリオ 2）

アンケートが要求し、予約が要求しなかったもの。いずれも汎用機構として入れる。

### `idFrom` — ドキュメント ID を身元にする（一人一回）

Firestore の `allow create` は**存在しないドキュメントにしか適用されない**。回答のドキュメント ID を
回答者の uid にすれば、2 回目の送信は「既存ドキュメントへの create」となり**ルールが自動で弾く**。
専用の重複チェックが要らない。

「1 人 1 票」「1 人 1 エントリー」にも効く汎用機構。

### `finalize` — 送信後は本人が編集できない

**2 つのシナリオが逆を要求するので、フラグにする必要がある。**

- アンケート（`finalize: true`）— 回答は書き切り。本人の update は成立しない
- 予約（`finalize: false`）— **マイ予約からキャンセル・変更できる**（段階 C の価値の一部）

本人の update は「自分の行 かつ 宣言されたフィールドの範囲 かつ 期限内」に限る。
owner/editor はどちらでも修正できる。

### `window` — 開始・締切をルールで持つ

`request.time` をアプリドキュメントの `until` / `from` と比較する。**クライアントの善意に頼らず
締切が効く。** 予約にも使える（「予約は 30 日先まで」）。

### `aggregate` — 集計の公開

回答者は他人の行を読めない（読めたら台無し）ので、**集計はルールでは作れない**。
オーナー（またはホスト）が集計して 1 つのドキュメントに書き、それを公開する。

```json
"aggregate": { "from": "responses", "publish": "results",
               "by": ["q1", "q2"], "visibility": "public" }
```

**結果はライブである必要がない**ので、D7（ホストは実行経路にいない）を壊さない。

### 宣言の例

```json
// app.json
"public": {
  "read": ["questions", "results"],
  "submit": { "responses": {
      "auth": "verifiedEmail",
      "idFrom": "auth.uid",
      "finalize": true,
      "window": { "until": "2026-09-30T23:59:59Z" },
      "createFields": ["q1","q2","q3","submittedAt"],
      "selfUpdate": {},
      "statusField": "status", "initialStatus": "submitted" } }
}
```

### 両立しないもの（明記して「やらない」と決める）

> **「一人一回」と「オーナーに対して匿名」は、この構成では両立しない。**

一人一回のためには身元がドキュメント ID になっている必要があり、オーナーはそのドキュメントを
読めるので匿名は嘘になる。ハッシュ化しても鍵がクライアントにある以上、意味がない。
**本物の匿名アンケートにはサーバー（Function）が要る。** できそうに見えてできない類なので、
ドキュメントに明記する。

---

## ライブ・段階的公開・非対称な可視性（シナリオ 3）

### 最重要: `gated` — フィールド単位の可視性は「ドキュメント分割」で実現する

三択問題を公開スキーマに置くと、**`correctChoice` もクライアントから読める**。生徒はネットワークを
見れば全問正解できる。そして**Firestore の読み取りは全部か無かで、ルールでフィールドは隠せない**
（「ルールが保証できないこと」参照）。

> **問題文・選択肢と、正解は、別コレクションに分けるしかない。**

```
questions/{qid}   問題文 + 3 択          public read
answerKey/{qid}   正解 + 解説            revealed == true のときだけ read
```

**これをエージェントの記憶に頼ってはいけない。** 分割し忘れても動く。テストも通る。
**授業で生徒が満点を取るまで誰も気づかない。** だから宣言で表現し、エンジンが分割を生成する:

```json
// questions/schema.json
"gated": { "fields": ["correctChoice", "explanation"], "revealBy": "revealed" }
```

チェックリストの「フィールド単位の可視性 — やらないと決めるか、ドキュメント分割を今入れるか」は、
**シナリオ 3 が答えを出した: 入れる。** そして**セキュリティを人間の注意力ではなく宣言に持たせる**
のは、テーゼ（宣言的で狭いことが統治を可能にする）の実例でもある。

### `session` — 主催者がペースを握る状態機械

```
apps/{aid}/session   { current: "q3", phase: "answering" | "revealed" | "closed" }
```

これまで扱ってきたのは全てレコードだったが、これは**ランタイムの状態**という新しい概念。
回答の受付もこれで縛る（ルールで `session.current == 回答の qid`
かつ `session.phase == 'answering'`）。**締切後の回答 = カンニングが構造的に不可能になる。**

- write: owner/editor（先生）のみ
- read: participant 以上

### `live` — ライブリスナーを宣言で切り替える

「公開ページは `onSnapshot` ではなくキャッシュ付き単発取得」（監視点 4）は**コスト都合の既定**で、
シナリオ 3 では**ライブが必須**。ビューまたはコレクションに `live: true` を宣言できるようにし、
既定は非ライブのままにする。

### `aggregate` のトリガー — 正答率は先生のブラウザが計算する

生徒は他人の回答を読めないので集計できない。**owner のブラウザ**が集計して `stats` ドキュメントに
書き、生徒はそれを読む。**ホストの Mac は関係ないので D7 は保たれる**（主催者のブラウザは
参加者であって、ビルド経路ではない）。

シナリオ 2 の `aggregate` に「フェーズ遷移で再計算」というトリガーを足す:

```json
"aggregate": { "from": "responses", "publish": "stats",
               "by": ["questionId", "choice"], "on": "session.phase == 'revealed'",
               "visibility": "participant" }
```

### 非対称な可視性のまとめ

| | 先生（owner） | 生徒（participant） |
|---|---|---|
| 問題文・選択肢 | 見える | 見える |
| 正解・解説 | 常に見える | **`revealed` の後だけ** |
| 自分の回答 | 見える | 見える |
| 他人の個別回答 | **見える** | 見えない |
| 全体統計 | 見える | 見える（`stats` 経由） |
| 全生徒の成績一覧 | **見える** | 見えない |

**全て既存の機構（行レベル read + `gated` + `stats` の publish）で表現でき、新しいルールの
形は要らない。** 要るのは `gated` の分割生成と `participant` ロール。

### `participant` ロール — 3 つのシナリオに共通する穴

生徒は member ではない（member にすると他人のデータが見える）。かといって
「リンクを知っている誰でも」では隣のクラスの生徒が入れる。

**「名指しされているが member ではない」層が、今の 3 値（owner / editor / viewer）に無い。**

```
owner        publish、メンバー管理、session の駆動、全件読み取り
editor       レコードの読み書き（全件）
viewer       レコードの読み取り（全件）
participant  submit + 自分の行 + public/gated-revealed のみ。全件は読めない
```

**これはシナリオ 2 にも効く** — 「社内の特定メンバーだけに配るアンケート」が今は書けない。
シナリオ 3 が前の 2 つの穴を照らした形。

---

## 記録の完全性と公開投票（シナリオ 4）

### `immutable` — オーナーにも書き換えられない記録

**設計の最大の欠落。** 現在のルールは owner/editor がいつでも item を update / delete できる。
**投票記録としては失格** — 議長が後から票を書き換えられる投票システムは、投票システムではない。

```json
"immutable": true   // create のみ。update / delete は誰も不可（owner も）
```

ルールでは `allow update, delete: if false` の一行。**「オーナーですら触れない」というカテゴリが
設計に無かった。** 議会以外にも効く: 監査ログ、同意の記録、検査結果、会計の仕訳。

### `peerVisibility` — 記名投票なら公開が正しい

議会の投票は普通**記名投票（roll call）**で、誰がどう投じたかは記録に残る。
つまり参加者は**全員の票を読める**。

これが決まると**リアルタイム集計の難問が消える。** シナリオ 3 では「生徒は他人の回答を読めないので
owner のブラウザが集計して publish する」必要があったが、議会では**各議員のブラウザが自分で数えられる。**

> **集計を担う信頼された計算機が要らない。議長のタブが閉じていても票数は正しい。**

投票システムとしてこれは本質的な性質。宣言で切り替える:

```json
"peerVisibility": "hidden"   // 授業・アンケート（既定）
"peerVisibility": "public"   // 議会
```

`public` のときは `allow read: if roleIn(aid, cid) != null`（参加者なら全件読める）。

### `aggregate.visibleFrom` — 集計をいつ見せるか

シナリオ 3 は「主催者が明かすまで見せない」、シナリオ 4 は「投票中からリアルタイム」。
**同じ機構で方針が逆。**

投票中に途中経過を見せるのは**バンドワゴン効果を生む**という設計判断でもある（議会では意図的に
そうすることも、避けることもある）。だから宣言で持つ:

```json
"aggregate": { "visibleFrom": "during" | "revealed" | "never" }
```

`peerVisibility: "public"` なら集計は各クライアントが計算するので、`stats` の publish 自体が不要。

### 戻って変えられない

`finalize: true` に加えて、**create 条件に `session.current == 投票の topicId`** を入れる
（シナリオ 3 と同じ機構）。過去のトピックへの投票は**ルールが弾く**ので、
クライアントの善意に頼らない。

### 秘密投票は範囲外（2 度目の同じ限界）

無記名投票にしたいなら、既出の限界に**2 度目に突き当たる**:

> **「一人一回」と「主催者に対して匿名」は両立しない。**

一人一票を保証するには身元がドキュメント ID になっている必要があり、owner はそれを読める。
**秘密投票にはサーバー（Function）が要る。記名投票は可、無記名投票は範囲外**と明記する。

---

## 宣言的な副作用（メール）

承認メールをホストに送らせると **D7 が壊れる**（オーナーがスマホから承認したとき Mac は寝ている）。

**Firebase の Trigger Email 拡張**を使う。`mail` コレクションにドキュメントを 1 つ書くと送信される。
カスタム Function のコードはゼロ（mulmoserver の「Functions を避ける」方針と実質的に整合）。

```json
// bookings/schema.json
"actions": {
  "approve": {
    "kind": "mutate",
    "set": { "status": "approved" },
    "then": { "email": { "to": "{{customerEmail}}", "template": "booking-approved" } }
  }
}
```

**`then.email` という宣言的な副作用**が、現設計に足りていないピース。入れると通知・リマインダー・
キャンセル連絡が全部同じ機構に乗る。

> **宣言はクライアントが実行するので、ルールが独立に再導出しなければ意味がない。**
> `then.email` を宣言しただけでは、書き手が `/mail` に任意の宛先・任意の内容を積める
> （サロンのドメインからのスパム中継）。publish は `collections[cid].mail`
> （`toField` / `statusField` / `on` / `dataFields`）を出し、ルールは 4 つを強制する:
>
> - **宛先 = その記録が持つアドレス**
> - **テンプレート = 宣言された `on` のキー**
> - **自由文は `dataFields` のみ**
> - **そのテンプレートが宣言する遷移が、この書き込みで起きたこと**
>   （`get() != getAfter()` かつ `getAfter() == on[template]`）
>
> 最後の 1 つが要点で、しかも**二段階で正しくなった**:
>
> 1. 宛先とテンプレートだけ縛っても、書き手は**どんな状態の記録にでも何度でも**積める
>    → 決定的な `mailId`（`{cid}_{itemId}_{template}`）で重複を封じる
> 2. `getAfter()` だけでは**「結果その状態である」しか言えない**。すでに `approved` の
>    予約に対して、**何も書かずにメールだけ**積める
>    → `get() != getAfter()` で**この書き込みが遷移させたこと**を要求する
>
> ここまでで **「承認したから送る」が「送るなら、この書き込みで承認していなければならない」**
> になる。クライアントは記録の更新とメールの enqueue を **1 つのバッチ**で書く。
>
> これは一般則: **宣言をルールが再導出できないなら、その宣言は助言でしかない。**

（SMTP 認証情報を 1 回設定する必要がある。コードではないが、セットアップコストではある。）

---

## HTML は生成物、スキーマが統治対象

**この節は、下の「宣言で表現できる範囲」の結論を書き換える。**

当初この計画は「カスタムビューの HTML が革新性の穴とセキュリティの穴を同じ場所に開ける」と
書いていた。危険は 2 つあり、**片方は消える。**

**(a) diff がレビューできない → 消える。** HTML が**スキーマの射影**であれば、そこに真実は無い。
使い捨てで、いつでも再生成できる。**ビルド成果物であってソースではない。** レビュー対象は git の
スキーマだけになる。保つべき規律は 1 つだけ:

> **HTML は、スキーマが持っていない真実を持ってはならない。**

これさえ守れば、LLM が毎回違う HTML を生成してよい。

**(b) メンバーのブラウザでコードが動く → 残る。** ゆえに sandbox iframe に隔離し、
**Firestore のハンドルを渡さない。** データは親フレームが渡し、生成された HTML は描画だけする。
これは「HTML を制限する緩和策」ではなく、**「自由に生成してよくするための前提条件」**。位置づけが逆。
その仕組みが **View Bridge**（下記）— ハンドルを渡さないままリアルタイムを実現する標準機構。

### なぜ生成された HTML を信頼しなくてよいのか

> **アクセス制御がデータ層で効いているから。**

シナリオ 3 の `gated` が効くのはこれ。正解が別コレクションにありルールが読ませないなら、
**ビューが何をしようと正解は取れない。** 逆に正解が読めるところに置いてあれば、どんなに行儀のいい
ビューを書いても無意味。

> **ビューの規律はセキュリティに何も寄与しない。ルールとスキーマだけが寄与する。**

**帰結: 統治がスキーマ層に全部移る。** 間違いはすべてスキーマの設計ミスとして現れる。

---

## View Bridge — 親がデータを push し、ビューは Firebase を知らない

sandbox された HTML が Firestore ハンドルを持たなくても、**親フレームが `onSnapshot` で受けた
データを postMessage で push すれば**リアルタイムに動く。これがこの設計の要。

**要点は、親を汎用プロキシにしないこと。** 「このクエリを実行して」を通したら sandbox の意味が消える。

> **ブリッジが公開するのは、宣言された「データセット名」と「アクション名」だけ。
> クエリ言語ではない。**

ルール（データ層）とブリッジ（宣言された面）の**二重防御**になる。

### 構造

```
+- 親フレーム（webview シェル / MT のセル）-----------------+
|  Firebase SDK・認証・onSnapshot・ref 解決・live 判断      |
|                     | MessageChannel (port)              |
|  +------------------v-----------------------------+      |
|  | iframe sandbox="allow-scripts"                  |      |
|  |  （allow-same-origin なし = origin は null）    |      |
|  |  LLM が生成した HTML — 描画のみ                 |      |
|  +-------------------------------------------------+      |
+-----------------------------------------------------------+
```

`allow-same-origin` を付けないので iframe の origin は `null` になり、**`event.origin` による
検証は使えない。** `MessageChannel` を使い、親が生成した port を最初の握手で 1 回だけ渡す。
**port を持っていることが身元。**

### プロトコル

親 → ビュー（push）:

| メッセージ | 中身 |
|---|---|
| `init` | スキーマ（フィールド、ラベル、i18n）、ロール、テーマ、protocol version |
| `data` | 名前付きデータセットのスナップショット（`{ dataset, items, meta }`） |
| `patch` | 差分（added / modified / removed）。**`CollectionStore` の `StoreChange` 粒度がそのまま乗る** |
| `state` | `session` ドキュメント（`current` / `phase`） |
| `status` | `connecting` / `live` / `stale` / `offline` |
| `result` / `error` | アクションの結果 |

ビュー → 親（request）:

| メッセージ | 中身 |
|---|---|
| `ready` | 握手完了 |
| `subscribe` | 宣言済みデータセットの購読（**宣言外は拒否**） |
| `action` | 宣言済みアクションの実行（**宣言外は拒否**）。親が自分の資格情報で書き、ルールが最終判定 |
| `resize` | 高さ（iframe の自動リサイズ） |

### 宣言

```json
"views": [{
  "id": "board", "type": "html", "file": "views/board.html",
  "datasets": ["questions", "stats"],   // これしか届かない
  "actions": ["vote"],                  // これしか呼べない
  "live": true
}]
```

親は**宣言されたデータセットにしか `onSnapshot` を張らない**。コストの上限も宣言で決まる。

### 副次的に解決するもの

1. **ref を辿る computed field**（監視点 3）— **親が解決してから渡す。** `service.duration` は
   解決済みで届き、ビューに ref キャッシュを持たせる必要が消える
2. **同じ HTML が両方のホストで動く** — 親が違うだけ。MT のセルでも公開 webview でも同じ HTML。
   **LLM は 1 つ生成すればいい**
3. **live か否かをビューが知らなくていい** — 「公開側はキャッシュ付き単発取得、メンバー側はライブ」
   （監視点 4）の使い分けが**親の中に閉じる**
4. **資格情報がビューに一切渡らない** — 公開ページを匿名訪問者に配っても認証情報は漏れない

### 親側でも検証する（ルールだけに任せない）

ビューから届く `action` のペイロードを**そのまま Firestore に流さない**。親が、スキーマの
`actions` に宣言された `mutate` / `set` の仕様、および `createFields` / `selfUpdate` に
照らして**型と許可フィールドを検証してから** SDK を呼ぶ。

ルールが最終防衛線であることは変わらないが、**ルールは理由を返せない**（許可か拒否かだけ）。
親で弾けば、生成された HTML に意味のあるエラーを返せる。

### ref 解決の深さを区切る

親が ref を解決してから push する（監視点 3）が、**深さは最大 2 階層まで**、循環は検出して
打ち切る。`bookings → service → duration` が 2 階層で、実用上ここで足りる。無制限にすると
公開ページのトラフィックで解決コストが読めなくなる。

### 実装上の制約

- **子側ライブラリは依存ゼロで数 KB** — 生成される HTML すべてにインライン展開されるため。
  `mt.on("data", …)` / `mt.action("vote", {…})` 程度の API に絞る
- **その API を LLM が知っている必要がある** — テンプレートとスキルに載せる（生成される HTML の
  品質はここで決まる）
- **protocol version を `init` に含める** — publish された HTML はシェルより古いことがある。
  HTML は再生成できるので致命的ではないが、劣化は graceful に
- **置き場所** — 両ホスト（MT の Vue セル、mulmoserver の webview）が同じ実装を使う必要がある。
  `@mulmoclaude/core` のブラウザ安全エントリ（`./remote-view` / `./plugin-vue` と同じ扱い）に
  `./view-bridge` を足すのが筋。Firebase を import しない（データは親が供給する）ので子側は素の JS

---

## テンプレートとスキーマリンター

### スキーマリンター（新規の成果物）

統治がスキーマ層に移った以上、**機械的に検出できる設計ミス**を潰すのがセキュリティの主戦場になる。
これまで「エージェントの記憶に頼ってはいけない」と繰り返してきたものが、全部リンターの項目になる。

| 検出できるミス | 何が起きるか |
|---|---|
| `public.read` のコレクションに正解・単価などが入っている（`gated` 未指定） | 授業で満点、価格の漏洩 |
| `finalize: true` なのに `idFrom` が無い | 一人一回のつもりが何回でも出せる |
| `peerVisibility: "public"` かつ `auth: "none"` | 匿名の第三者が全件読める |
| `selfUpdate` に管理用フィールド（`status`、`role` 等）が混ざっている | 申込者が自分で承認できる（権限昇格） |
| `public` / `collections` / `participantRead` を宣言しない | ルールが存在しないキーを参照して**全部拒否**（ガード必須） |
| `aggregate.visibleFrom: "during"` かつ `peerVisibility: "hidden"` | 誰が集計するのか未定義 |
| `immutable: true` かつ本人による変更を期待している | 矛盾 |
| `window` があるのに `session` も `finalize` も無い | 締切後の扱いが未定義 |
| `selfUpdate` のどれかの状態に `statusField` が入っている | **本人が自分の承認状態を変えられる（権限昇格）** |
| `selfUpdate` が状態別でなく、承認後も予約枠を触れる | **客が承認済みの予約を黙って移動できる**（枠が移り、再承認されない） |
| `mail.on[t].from` に `to` と同じ状態が含まれる | 遷移していないのに通知が送れる |
| `actions` が `require` を宣言しているのに `collections[cid].transitions` が無い | writer が任意の状態遷移をできる（宣言が助言になる） |
| `transitions` に `initial` が無い | status を持たない既存レコードが**恒久的に書き込み不能**になる |
| `transitions` の `initial` が終端状態（`approved` 等）を含む | 復帰口から承認済みを作れる |
| `idFrom` が enum 外の文字列 | ルールが解釈できず、投稿が全部拒否される（または 1 件に潰れる） |
| `gateOn` があるのに `session` を持たないアプリ | create が常に失敗する |
| `then.email` があるのに `collections[cid].mail`（`toField` / `templates`）を publish していない | 承認メールが常に拒否される |
| 公開投稿コレクションに `validate.required` が無い | **必須欠落のレコードを誰でも投げ込める** |
| `audience: "participant"` を宣言しているのに `members` が無い | **投稿が全部 fail closed**（原因が見えない） |
| authored な `app.json` が `memberEmails` を手書きしている | 導出物の二重管理。`members` と乖離した瞬間に publish がルールに拒否される |
| `mail.on` のテンプレートが `actions.*.then.email` と食い違う | 承認メールが常に拒否される |
| `window` の端点が ISO として解釈できない | publish が `fromMs` / `untilMs` を出せず、**投稿が全部拒否される** |
| `peerVisibility: "public"` なのに `validate.choiceField` が無い | 集計が enum 外の値で汚染される |
| `icon` が無い / `actions` がオブジェクトマップ | **既存文法エラー**（必須キー欠落・型不一致）。schema が読み込まれない |
| `mutate` に `when`（正しくは `require`） | **エラーにならず黙って消える**。ゲートが外れた状態で動く |

**どれもスキーマだけを見て判定できる。** `putSchema` と publish の両方で走らせる
（publish 側は「ライブデータの検証」と同じ関門）。

> **ただし「パース後」だけでは走らせられない。** `schemaZ.ts` の設計は
> **未知キーをバリアントごとに黙って落とす**（冒頭コメント: "an unknown key is stripped
> per-variant"）。`CollectionObjectZ` は `.strict()` ではない。つまり `immutable` `then`
> `datasets` `gated` のような**新キーは、実装が入るまでパースの時点で消える**し、
> `mutate` に書いた `when` も**エラーではなく消える**。
>
> 帰結は 2 つ:
> - リンターは **生の JSON** を見る必要がある（`acceptParsedSchema` の延長「だけ」では不十分）
> - あるいは新キーの導入と同時に**該当バリアントを `.strict()` にする**。
>   PR #2209 が firestore アームだけ `.strict()` にしたのと同じ判断
>
> **結論: 二者択一ではなく、層が違う。両方要る。**
>
> - **Zod（構造）** — 新キーを定義に足し、該当バリアントを `.strict()` にする。
>   足さなければ新キーはパースで消え、`.strict()` にしなければ `when`/`require` の
>   取り違えが**エラーにならず消える**
> - **リンター（意味）** — 「`selfUpdate` に `statusField` が入っている」
>   「`peerVisibility: public` かつ `auth: none`」のような**関係の検査**は Zod では書けない
>
> 順序だけは決まっている: **Zod 側が先。** 消えるキーを意味検査しても仕方がない。

### テンプレートは「業種」ではなく「形」で索引する

LLM が参照するときに効くのは完成品ではなく、**判断と、間違えたときに何が起きるか**。
4 つのシナリオはパターンとして抽象化する:

| パターン | 形 | 代表的な設定 |
|---|---|---|
| **P1 予約** | リソース × 時間 × 承認 × 通知 | `schedule`, 承認アクション, `then.email` |
| **P2 収集** | 一人一回 × 期限 × 集計 | `idFrom`, `finalize`, `window`, `aggregate` |
| **P3 ライブ授業** | 主催者駆動 × 段階的公開 | `session`, `gated`, `live` |
| **P4 記録** | 不変 × 公開 × ライブ集計 | `immutable`, `peerVisibility`, `visibleFrom` |

「社内の備品貸出」は P1、「読書会の出欠」は P2、「品質検査の記録」は P4。
**業種名で引くと LLM は 4 つのサンプルの外に出られないが、形で引けば無限に適用できる。**

各テンプレートには**罠を併記する** —「`gated` を忘れると生徒が満点を取る」「`immutable` が無いと
議長が票を書き換えられる」。テンプレートの価値は完成品ではなくこの注記にある。

配布は既存の Discover レジストリ（`@mulmoclaude/core/collection/registry/server` の
`listRegistry` / `importRegistry`、公式は `receptron/mulmoclaude-collections`）に乗せられる。

### 汎用性を守る不変条件

> **テンプレートはエンジンを一切拡張しない。純粋なデータである。**
> **テンプレートを書くのにコード変更が要ったなら、それは宣言言語の欠落であって
> テンプレートの問題ではない。**

これがテンプレートを「サンプル」に留め、システムを汎用に保つ唯一の防波堤。

---

## 宣言で表現できる範囲 — この構想の寿命を決める場所

> **注: セキュリティ面の結論は上の「HTML は生成物、スキーマが統治対象」で更新済み。**
> HTML はデータ層で守られた sandbox 内の生成物なので、自由に生成してよい。
> この節が扱うのは**残る方の問題** — 宣言で書けないことが増えると、
> スキーマが痩せて HTML に真実が移り、**レビュー対象が消える**という劣化。

宣言で書けない要求が増えると「LLM に HTML を書かせればいい」で済ませたくなり、そのとき
**HTML はスキーマの射影ではなくなる**（= 上の規律を破る）。そうなると git のスキーマを読んでも
アプリが何をするか分からず、「git で管理される React アプリ」に戻る。それはもう新しくない。

つまり守るべきは「HTML を書かせない」ことではなく、**「HTML に真実を移させない」**こと。
そのためには宣言で表現できる範囲を widen し続けるしかない。

**美容室シナリオはこの圧力を即座にかけてくる。** 「シフト − 承認済み予約 − 所要時間 = 空き枠」は
レコード単位の computed field（`deriveAll`）では書けない、複数レコードを跨ぐ計算だから。

**答えは schedule ビューを宣言的なビュー型として一級市民にすること:**

```json
"views": [{
  "type": "schedule",
  "resource": "stylists",
  "availability": "shifts",
  "busy": { "collection": "bookings", "when": "status == 'approved'" },
  "slot": { "durationFrom": "services.duration" },
  "submit": "bookings"
}]
```

「リソース × 時間 × 所要時間 × 予約」は業種を超えて繰り返し現れる（会議室、設備、面談、レンタル）。
1 つ作れば何度も効く。**この一手を打てるかどうかが「コードを書かずに」が本当かどうかを決める。**

**アンケートで同じ役割を果たすのが条件分岐（スキップロジック）** — 「Q3 が『はい』なら Q4 を出す」。
HTML に逃がすと元の木阿弥なので、**既存の `when`（`fieldBase`）を条件表示に使い**、
多段分岐が要るときも**完全なスクリプトではなく単純な式に限る**のが線。ここも「どこまで宣言で書けるか」の実験場になる。

方針:

- 宣言で表現できる範囲を意図的に広げ続ける（HTML に逃げる理由を減らす — ここが製品開発の中身）
- HTML ビューは別扱い（publish 時に警告、レビュー必須、webview では sandbox iframe に隔離して
  Firestore ハンドルを渡さない）
- 少なくとも **HTML ビューを持つアプリは一覧で見分けがつく**ようにする

---

## D7 が漏れうる箇所（監視点）

1. **メール送信をホスト監視で実装しない** — Trigger Email 拡張の採用は好みではなく不変条件
2. **publish のペイロードが完結していること** — Web が必要とするもの（スキーマ、ビュー HTML、
   public 設定）が全部 Firestore/Hosting に載る。実行時にディスクを参照する経路が 1 本でも残ったら嘘になる
3. **ref を辿る computed field** — 予約の終了時刻は `service.duration` を参照する。
   remote-host 経路は ref キャッシュがないので諦めている（"formulas that dereference `ref` fields
   stay absent"）が、**webview では諦められない**。→ **View Bridge の親側が解決してから push する**
   ことで解決（ビューは解決済みの値を受け取る）。タダではないが、置き場所は決まった
4. **匿名トラフィックのコスト** — 公開側は既定で `onSnapshot` ではなく**キャッシュ付きの単発取得**。
   メンバー向け画面はライブでよい。**ただしシナリオ 3 はライブが必須**なので、`live: true` を
   宣言で切り替えられるようにする（既定は非ライブ）

---

## UI（前提: 種別は 1 つ、状態は隠せない）

**「別の種類のコレクション」ではなく「コレクションの、隠せない属性」。**

- **名詞は分けない** — コレクションはコレクション。バックエンド名（Firestore）を UI に出さない。
  軸は保存先ではなく**可視範囲**（「共有中 — 5 人」「このMacだけ」）
- **作成時は明示的な 2 択**。ドロップダウンの 4 番目にしない。既定を持たせない。
  **エージェント経由も同じ** — 「レストランのリスト作って」から共有が生まれてはいけない
- **バッジは消えない**。他人が所有するものは別セクション（削除できない・スキーマを変えられないという
  非対称があるので、同じ棚に並べると失敗の理由が分からなくなる）。
  未接続時に全操作が失敗する挙動の**エラーの先出し**にもなる
- **変換は一方向・確認あり**。「何が自分のマシンを離れるか」を名指しする。トグルにしない
- ヘッダーは 2 行:

```
共有中 — 5人（owner: satoshi、editor 2、viewer 2）              ← Firestore
定義 — github.com/receptron/salon @ a1b2c3d（2日前に publish）  ← git
```

下の行は **publish 忘れが一目で分かる**行でもある。

**スキルとドキュメントだけは分ける** — 共有のセットアップ手順（ログイン、招待、ロール、
オフラインの意味）は本当に別物。概念は 1 つ、手順書は別。

---

## サンプルのテーブル設計とスキーマ

**LLM 向けのテンプレート実体。** 4 つのシナリオを実際のスキーマとして書き下ろす。

> **この節が示すのは authored な形**（リポジトリにコミットする `app.json` と `schema.json`）で、
> Firestore の `apps/{aid}` は publish が導出した別のドキュメント。
> 対応は「authored な `app.json` と published な `apps/{aid}` は別物」の変換表を参照。
> 特に `window` の端点は **ISO で書き、publish が epoch millis に落とす**。
>
> この節の JSON ブロックは**すべて単体で valid な JSON**（機械検証済み）。
> 上の各節にある JSON は説明用の**断片**（キーだけを抜き出したもの）なので、そのままでは
> パースできない。テンプレートとして起こすのはこの節。

### 語彙の区別（重要）

サンプルは**既存の語彙**と**この計画が提案する語彙**を混ぜている。LLM が存在しないキーを
学習しないよう、区別を明示する。

**既存のフィールド型**（`@mulmoclaude/core/collection` の `FieldSpecZ`、実在を確認済み）:

`string` `text` `markdown` `number` `money` `boolean` `toggle` `date` `datetime`
`enum` `status` `ref` `email` `image` `file` `location` `table` `derived` `embed`
`backlinks` `rollup` `flag`

`derived` `embed` `backlinks` `rollup` `toggle` `flag` は **computed**（レコードに書かれない）。

**既存のアクション種別**: `chat`（可視 LLM） / `agent`（隠しワーカー） / `mutate`（宣言的な書き込み）。

**既存の文法で間違えやすい点**（レビューで実際に間違えた。`schemaZ.ts` で確認済み）:

- **`icon` はコレクション必須**（`CollectionObjectZ`）。省略すると schema が通らない
- **`actions` は配列**（`z.array(ActionSpecZ)`）。オブジェクトマップではない。各要素に
  一意な `id` と `label` が要る（`actionBase`、`id` 重複は refine で拒否）
- **`mutate` アクションのゲートは `require`**、`when` ではない（`when` は `chat`/`agent` 側）。
  `require` は表示条件かつ**サーバー側の認可条件**でもある
- **フィールドの条件表示は既存の `when`**（`fieldBase`）。新しいキーを足す必要はない

**この計画が新規に提案するキー**（実装が要る。定義箇所を併記）:

| キー | 置き場所 | 定義 |
|---|---|---|
| `storage.type: "firestore"` + `cid` | schema | D1 / D2 |
| `immutable` | schema（コレクション） | シナリオ 4 |
| `revealGated` | schema（`gated` の生成物） | シナリオ 3 |
| `peerVisibility` | schema（コレクション） | シナリオ 4 |
| `gated` | schema（コレクション） | シナリオ 3 |
| `views[].datasets` / `.actions` / `.live` | schema | View Bridge |
| `views[].type: "schedule"` | schema | 宣言の境界 |
| `actions.*.then.email` | schema | 宣言的な副作用 |
| `aggregate` | schema | シナリオ 2 / 3 / 4 |
| `aid` / `members` / `public` | `app.json` | D1 / 権限モデル |
| `public.submit[cid].*`（`createFields` / `selfUpdate` / `selfTransitions` / `idFrom` / `idField` / `gateOn` …） | `app.json` | 認証段階・シナリオ 2/3/4 |
| `session` | Firestore ドキュメント | シナリオ 3 |

> **既存の custom view との関係**: `CollectionCustomView` は既に sandbox iframe +
> **capability トークン + `dataUrl`**（`__MC_VIEW.dataUrl`、`capabilities: ["read","write"]`）
> でビューにデータを渡している。**ビューが Firestore を触らない、という原則は既に実装済み。**
> View Bridge はその**ホスト非依存の後継** — 公開 webview にはホストの HTTP エンドポイントが
> 無いので、fetch ではなく親フレームからの push にする。`capabilities` が `datasets` / `actions`
> に対応する。**並行して別機構を作らないこと。**

---

### S1 — 美容室の予約（P1 予約パターン）

**テーブル設計**

```
stylists  1 ──< shifts        美容師のシフト
stylists  1 ──< bookings      担当
services  1 ──< bookings      メニュー（所要時間の供給元）
```

`bookings.endAt` は `services.duration` を ref 越しに参照する `derived`。
**View Bridge の親側が ref を解決してから push する**（監視点 3）。

**`app.json`**

```json
{
  "aid": "app_salon_7f3a",
  "aidEnv": "MT_APP_SALON",
  "name": "Sakura Hair 予約",
  "owner": "<uid>",
  "members": { "owner@salon.jp": { "*": "owner" },
               "stylist-a@salon.jp": { "bookings": "editor", "shifts": "viewer", "services": "viewer" } },
  "collections": {
    "bookings": {
      "transitions": { "initial": ["pending"],
                       "pending": ["approved", "rejected", "cancelled"],
                       "approved": ["cancelled"],
                       "rejected": [], "cancelled": [] },
      "mail": { "toField": "customerEmail",
                "statusField": "status",
                "on": { "booking-approved": { "from": ["pending"], "to": "approved" },
                        "booking-rejected": { "from": ["pending"], "to": "rejected" } },
                "dataFields": ["customerName", "startAt"] }
    },
    "services": {}, "shifts": {}, "stylists": {}
  },
  "participantRead": [],
  "public": {
    "enabled": true,
    "read": ["services", "shifts", "stylists"],
    "submit": {
      "bookings": {
        "auth": "verifiedEmail",
        "emailField": "customerEmail",
        "idFrom": "auto",
        "finalize": false,
        "createFields": ["customerName","customerEmail","service","stylist","startAt","status"],
        "selfUpdate": { "pending":  ["customerName","startAt","stylist"],
                        "approved": ["customerName"] },
        "selfTransitions": { "pending": ["cancelled"], "approved": ["cancelled"] },
        "statusField": "status",
        "initialStatus": "pending",
        "validate": { "required": ["customerName", "customerEmail", "service", "startAt", "status"] },
        "window": { "until": "2026-12-31T23:59:59Z" }
      }
    }
  }
}
```

`finalize: false` = 客が「マイ予約」から変更できる。**`status` は `createFields` にあるが
`selfUpdate` には無い** — 作成時は `initialStatus` の検証のために必要だが、更新で触らせると
**客が自分の予約を `approved` にできてしまう**（権限昇格）。キャンセルは `selfTransitions` で
宣言された遷移としてのみ許す。

そして **`selfUpdate` は状態ごと**。`approved` の欄に `startAt` / `stylist` が無いのが要点で、
**承認後に客が枠を動かせない**（動かしたければキャンセルして取り直す）。平坦なリストだと、
承認済みの予約が黙って別の時間帯に移り、`schedule` ビューの busy 判定だけが更新される。

**`.claude/skills/services/schema.json`**

```json
{
  "slug": "services", "title": "メニュー", "icon": "content_cut",
  "storage": { "type": "firestore" },
  "primaryKey": "name",
  "fields": {
    "name":     { "type": "string", "label": "メニュー名", "primary": true, "required": true },
    "duration": { "type": "number", "label": "所要時間（分）", "required": true },
    "price":    { "type": "money",  "label": "料金", "currency": "JPY" }
  }
}
```

**`.claude/skills/stylists/schema.json`**

```json
{
  "slug": "stylists", "title": "スタッフ", "icon": "person",
  "storage": { "type": "firestore" },
  "primaryKey": "name",
  "fields": {
    "name":   { "type": "string", "label": "名前", "primary": true, "required": true },
    "photo":  { "type": "image",  "label": "写真" },
    "active": { "type": "boolean","label": "在籍中" }
  }
}
```

**`.claude/skills/shifts/schema.json`**

```json
{
  "slug": "shifts", "title": "シフト", "icon": "schedule",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "fields": {
    "id":      { "type": "string",   "primary": true },
    "stylist": { "type": "ref",      "label": "担当", "collection": "stylists", "required": true },
    "date":    { "type": "date",     "label": "日付", "required": true },
    "startAt": { "type": "datetime", "label": "開始", "required": true },
    "endAt":   { "type": "datetime", "label": "終了", "required": true }
  }
}
```

**`.claude/skills/bookings/schema.json`**

```json
{
  "slug": "bookings", "title": "予約", "icon": "event",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "fields": {
    "id":            { "type": "string",   "primary": true },
    "customerName":  { "type": "string",   "label": "お名前", "required": true },
    "customerEmail": { "type": "email",    "label": "メール", "required": true },
    "service":       { "type": "ref",      "label": "メニュー", "collection": "services", "required": true },
    "stylist":       { "type": "ref",      "label": "担当",     "collection": "stylists" },
    "startAt":       { "type": "datetime", "label": "開始時刻", "required": true },
    "endAt":         { "type": "derived",  "label": "終了時刻",
                       "expr": "startAt + minutes(service.duration)" },
    "status":        { "type": "status",   "label": "状態",
                       "values": ["pending", "approved", "rejected", "cancelled"] }
  },
  "actions": [
    { "id": "approve", "kind": "mutate", "label": "承認する",
      "require": { "field": "status", "in": ["pending"] },
      "set":     { "status": "approved" },
      "then":    { "email": { "to": "{{customerEmail}}", "template": "booking-approved" } } },
    { "id": "reject", "kind": "mutate", "label": "お断りする",
      "require": { "field": "status", "in": ["pending"] },
      "set":     { "status": "rejected" },
      "then":    { "email": { "to": "{{customerEmail}}", "template": "booking-rejected" } } }
  ],
  "views": [{
    "id": "book", "type": "schedule", "label": "予約する", "live": false,
    "resource":     "stylists",
    "availability": "shifts",
    "busy":   { "collection": "bookings", "when": "status == 'approved'" },
    "slot":   { "durationFrom": "services.duration" },
    "submit": "bookings"
  }]
}
```

**罠**

- `services.price` を `public.read` に入れているので**料金は公開される**。非公開にしたいなら
  `gated` が要る（S3 参照）
- `then.email` を書くだけでは足りない。**`collections.bookings.mail` を publish しないと
  承認メールがルールに拒否される**（そして書かないと、書き手が任意の宛先に送れてしまう）
- `endAt` が `derived` なので**保存されない**。集計や衝突判定は毎回計算される
- 空き枠計算は `schedule` ビューが持つ。**ここを HTML に逃がすと宣言の意味が消える**

---

### S2 — Web アンケート（P2 収集パターン）

**テーブル設計**

```
questions   質問（公開読み取り）
responses   回答（一人一回・書き切り・本人と owner のみ）
results     集計（aggregate が publish、公開読み取り）
```

**`app.json`（抜粋）**

```json
{
  "aid": "app_survey_2026q3",
  "collections": { "questions": {}, "responses": { "peerVisibility": "hidden" }, "results": {} },
  "participantRead": [],
  "public": {
    "enabled": true,
    "read": ["questions", "results"],
    "submit": {
      "responses": {
        "auth": "verifiedEmail",
        "idFrom": "auth.uid",
        "finalize": true,
        "window": { "from": "2026-09-01T00:00:00Z", "until": "2026-09-30T23:59:59Z" },
        "createFields": ["q1","q2","q3","status"],
        "selfUpdate": {},
        "statusField": "status",
        "initialStatus": "submitted",
        "validate": { "required": ["q1", "status"],
                      "choiceField": "q1", "choiceValues": ["a", "b", "c"] }
      }
    }
  }
}
```

**この S2 は `audience` を宣言していない** — ログインした人なら誰でも 1 回答えられる、
という「リンクを知っている人向け」のアンケート。`idFrom: "auth.uid"` が一人一回を担保する。

**名指しの相手だけに配るなら `audience: "participant"` を足し、`members` を宣言する。**
`members` が無いまま `audience` だけ書くと `listed()` が偽になり、**投稿が全部拒否される**
（fail closed で、原因が「権限エラー」ではなく「なぜか送れない」として現れる）:

```json
{
  "members": { "owner@x.jp": { "*": "owner" }, "member-1@x.jp": { "*": "participant" } }
}
```

**`memberEmails` は書かない。** `members` からの純粋な導出で、`members` を書く経路
（publish と招待 UI）が必ず一緒に生成する。ルールの `membersConsistent()` は
**ずれた状態を書き込めなくするための不変条件**であって、人に二重管理を課すためのものではない。

**`questions/schema.json`**

```json
{
  "slug": "questions", "title": "設問", "icon": "help",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "fields": {
    "id":      { "type": "string", "label": "ID", "primary": true },
    "order":   { "type": "number", "label": "表示順" },
    "text":    { "type": "text",   "label": "設問文", "required": true },
    "kind":    { "type": "enum",   "label": "形式", "values": ["single","multi","scale","free"] },
    "choices": { "type": "table",  "label": "選択肢",
                 "fields": { "value": { "type": "string" }, "label": { "type": "string" } } },
    "required":{ "type": "boolean","label": "必須" }
  }
}
```

**`responses/schema.json`**

```json
{
  "slug": "responses", "title": "回答", "icon": "how_to_reg",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "peerVisibility": "hidden",
  "fields": {
    "id":     { "type": "string", "label": "ID", "primary": true },
    "q1":     { "type": "enum",   "label": "Q1", "values": ["a","b","c"], "required": true },
    "q2":     { "type": "number", "label": "Q2（1-5）" },
    "q3":     { "type": "text",   "label": "Q3 自由記述",
                "when": { "field": "q1", "in": ["a"] } },
    "status": { "type": "status", "values": ["submitted"] }
  },
  "aggregate": {
    "from": "responses", "publish": "results",
    "by": ["q1", "q2"], "visibleFrom": "revealed", "visibility": "public"
  }
}
```

**罠**

- `idFrom: "auth.uid"` を**書き忘れると一人が何回でも回答できる**（リンターが検出）
- `selfUpdate: {}` は `finalize: true` と重複するが、**明示しておくと意図が読める**
- `finalize: true` と `window` は**両方**要る。`window` だけだと締切前に何度でも上書きできる
- **「一人一回」と「主催者に対して匿名」は両立しない**（サーバーが要る。範囲外）

---

### S3 — オンライン授業の演習（P3 ライブ授業パターン）

**テーブル設計 — 分割が要点**

```
questions   問題文 + 3択          public read      ← 正解を入れてはいけない
answerKey   正解 + 解説           revealed のみ    ← gated が生成する
responses   生徒の回答            本人 + 先生のみ
stats       正答率                aggregate が publish
session     現在の問題とフェーズ  参加者は read のみ
```

**`app.json`（抜粋）**

```json
{
  "aid": "app_class_algebra",
  "members": { "teacher@school.jp": { "*": "owner" },
               "student-1@school.jp": { "*": "participant" } },
  "collections": { "questions": {}, "answerKey": { "revealGated": true, "gatedFrom": "questions", "revealBy": "revealed" },
                   "responses": { "peerVisibility": "hidden", "immutable": true }, "stats": {} },
  "participantRead": ["questions", "stats"],
  "public": {
    "enabled": false,
    "read": [],
    "submit": {
      "responses": {
        "auth": "verifiedEmail", "audience": "participant",
        "idFrom": "auth.uid+field", "idField": "questionId",
        "finalize": true,
        "createFields": ["questionId","choice","status"],
        "selfUpdate": {},
        "statusField": "status", "initialStatus": "answered",
        "validate": { "required": ["questionId", "choice", "status"],
                      "choiceField": "choice", "choiceValues": ["A", "B", "C"] },
        "gateOn": { "phase": "answering", "match": "questionId" }
      }
    }
  }
}
```

`gateOn` = create 条件に `session.current == questionId && session.phase == "answering"` を課す。
**締切後の回答＝カンニングがルールで不可能になる。**

`idFrom` は**有限の enum**。`"auth.uid+field"` + `idField` で複合 ID
（`{uid}_{questionId}`）になり、**問題ごとに一人一回**が成立する。`"auth.uid"` だけだと
全問で 1 ドキュメントしか作れない。

**`questions/schema.json`**

```json
{
  "slug": "questions", "title": "設問", "icon": "quiz",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "gated": { "fields": ["correctChoice", "explanation"], "revealBy": "revealed" },
  "fields": {
    "id":            { "type": "string", "label": "ID", "primary": true },
    "order":         { "type": "number", "label": "表示順" },
    "text":          { "type": "text",   "label": "問題文", "required": true },
    "choiceA":       { "type": "string", "label": "A", "required": true },
    "choiceB":       { "type": "string", "label": "B", "required": true },
    "choiceC":       { "type": "string", "label": "C", "required": true },
    "correctChoice": { "type": "enum",   "label": "正解", "values": ["A","B","C"], "required": true },
    "explanation":   { "type": "markdown", "label": "解説" },
    "revealed":      { "type": "boolean", "label": "公開済み" }
  }
}
```

**`gated` が生成する実体**（エージェントが手で書くのではない）:

```
apps/{aid}/collections/questions/items/{id}   id, order, text, choiceA..C, revealed
apps/{aid}/collections/answerKey/items/{id}   correctChoice, explanation
```

生成されるコレクション設定（`app.collections.answerKey`、publish 時に載る）:

```json
{ "revealGated": true, "gatedFrom": "questions", "revealBy": "revealed" }
```

**`answerKey` のドキュメント自身は `revealed` を持たない。** だから read ルールは
**親（`questions`）の同じ id を `get()` して**フラグを見る。従属側のフラグを見にいくと
永久に false のままで、正解が明かされても生徒に届かない（初稿の欠陥）。
`get()` が 1 回増えるが、問題数ぶんしか呼ばれない。

**`responses/schema.json`**

```json
{
  "slug": "responses", "title": "回答", "icon": "how_to_reg",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "peerVisibility": "hidden",
  "immutable": true,
  "fields": {
    "id":         { "type": "string", "label": "ID", "primary": true },
    "questionId": { "type": "ref",    "collection": "questions", "required": true },
    "choice":     { "type": "enum",   "values": ["A","B","C"], "required": true },
    "correct":    { "type": "derived", "expr": "choice == questionId.correctChoice" },
    "status":     { "type": "status", "values": ["answered"] }
  },
  "aggregate": {
    "from": "responses", "publish": "stats",
    "by": ["questionId", "choice"],
    "on": "session.phase == 'revealed'",
    "visibleFrom": "revealed", "visibility": "participant"
  },
  "views": [{
    "id": "quiz", "type": "html", "file": "views/quiz.html",
    "datasets": ["questions", "stats", "session"],
    "actions": ["answer"], "live": true
  }]
}
```

**`session` ドキュメント**（レコードではなくランタイム状態）

```json
{ "current": "q3", "phase": "answering", "startedAt": "2026-09-10T01:00:00Z" }
```

**罠**

- **`gated` を忘れると生徒は全問正解できる。** 動くしテストも通る。**授業で満点が出るまで
  誰も気づかない。** これがリンター最優先の項目である理由
- `correct` は `derived` なので `answerKey` が読めない生徒側では**解決されない** —
  それが正しい（明かす前に正誤が分かってはいけない）
- `immutable: true` により、生徒も先生も回答を書き換えられない
- **生徒は `participant` なので `responses` の全件は読めない。** ルールの `reader()` は
  owner/editor/viewer だけを含み、`participant` は「自分の行」までしか届かない
  （名簿に載っていることと、データを読めることは別）

---

### S4 — 議会の投票（P4 記録パターン）

**テーブル設計**

```
topics    議題                    参加者 read
votes     投票（記名・不変）      参加者が全件 read ← peerVisibility: public
session    現在の議題とフェーズ   参加者 read のみ
```

**集計コレクションが無いのが要点。** `peerVisibility: "public"` なので
**各クライアントが自分で数える**。集計を担う信頼された計算機が要らない。

**`app.json`（抜粋）**

```json
{
  "aid": "app_council_2026",
  "members": { "chair@council.jp": { "*": "owner" },
               "member-01@council.jp": { "*": "participant" } },
  "collections": { "topics": { "immutable": true },
                   "votes": { "immutable": true, "peerVisibility": "public" } },
  "participantRead": ["topics"],
  "public": {
    "enabled": false,
    "read": [],
    "submit": {
      "votes": {
        "auth": "verifiedEmail", "audience": "participant",
        "idFrom": "auth.uid+field", "idField": "topicId",
        "finalize": true,
        "createFields": ["topicId","voter","choice","status"],
        "selfUpdate": {},
        "statusField": "status", "initialStatus": "cast",
        "validate": { "required": ["topicId", "voter", "choice", "status"],
                      "choiceField": "choice", "choiceValues": ["yes", "no", "abstain"] },
        "gateOn": { "phase": "voting", "match": "topicId" }
      }
    }
  }
}
```

**`topics/schema.json`**

```json
{
  "slug": "topics", "title": "議題", "icon": "gavel",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "immutable": true,
  "fields": {
    "id":    { "type": "string",   "label": "ID", "primary": true },
    "order": { "type": "number",   "label": "表示順" },
    "title": { "type": "string",   "label": "議題", "required": true },
    "body":  { "type": "markdown", "label": "議案本文" },
    "closedAt": { "type": "datetime", "label": "採決時刻" }
  }
}
```

**`votes/schema.json`**

```json
{
  "slug": "votes", "title": "投票", "icon": "ballot",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "immutable": true,
  "peerVisibility": "public",
  "fields": {
    "id":      { "type": "string", "label": "ID", "primary": true },
    "topicId": { "type": "ref",    "label": "議題", "collection": "topics", "required": true },
    "voter":   { "type": "string", "label": "議員", "required": true },
    "choice":  { "type": "enum",   "label": "賛否", "values": ["yes","no","abstain"], "required": true },
    "status":  { "type": "status", "label": "状態", "values": ["cast"] }
  },
  "aggregate": {
    "from": "votes", "by": ["topicId", "choice"],
    "visibleFrom": "during", "visibility": "participant"
  },
  "views": [{
    "id": "floor", "type": "html", "file": "views/floor.html",
    "datasets": ["topics", "votes", "session"],
    "actions": ["cast"], "live": true
  }]
}
```

`aggregate` に `publish` が**無い**のは意図的 — 全件読めるので各クライアントが計算する。

**`session` ドキュメント**

```json
{ "current": "t7", "phase": "voting" }
```

**罠**

- **`immutable` が無いと議長が票を書き換えられる。** 投票システムとして失格
- `peerVisibility: "public"` かつ `auth: "none"` は**匿名の第三者に全票を晒す**（リンターが検出）
- 定足数を出すには**投票していない参加者**を数える必要がある。`members` のうち
  `participant` の数はアプリドキュメントから取れる
- **無記名投票は範囲外**（サーバーが要る）
- `peerVisibility: "public"` は `listed(aid)`（名簿にいる全員）に全件読みを許す。
  **participant が全件を読める唯一の経路**であり、記名投票では意図どおり

---

## 美容室シナリオの充足状況

| 要素 | 現設計 | 必要なもの |
|---|---|---|
| シフト入力（オーナー） | ○ | — |
| サービス別の所要時間 | ○ | computed field（ただし ref 解決、監視点 3） |
| 美容師ごとの権限 | 要追加 | コレクション別ロール（D1） |
| Web に公開 | 要追加 | `public.read`（ルール） |
| **誰でも申込み** | **要追加** | **制約付き create + `auth` の 3 段階 + App Check**（ルール） |
| 客が自分の予約を見る（段階 C） | **要追加** | 行レベル read（`emailField == email()`） |
| オーナー/美容師が承認 | ○ | mutate アクション |
| **承認メール** | **要追加** | **`then.email` + Trigger Email 拡張** |
| 二重予約 | ○ | **承認フローが競合解決そのもの**（両方 pending で入り、片方だけ承認） |
| **空き枠の表示** | **要追加** | **schedule ビュー**、さもなくば HTML 逃げ道 |

---

## Web アンケートシナリオの充足状況

| 要素 | 現設計 | 必要なもの |
|---|---|---|
| 質問の定義 | ○ | schema のフィールド型 |
| ログインして回答 | 要追加 | `auth: "verifiedEmail"`（段階 C） |
| **同じ人は 1 回だけ** | **要追加** | **`idFrom`**（ドキュメント ID を身元に） |
| 送信後は編集不可 | 要追加 | `finalize: true`（予約は `false` で本人が変更可） |
| 締切 | 要追加 | `window` + `request.time` |
| 他人の回答が見えない | ○ | 行レベル read |
| 自分の回答を確認 | 要追加 | 行レベル read（`itemId == uid`） |
| **結果の集計を公開** | **要追加** | **`aggregate` → `results` ドキュメント** |
| 条件分岐（スキップロジック） | ○（既存 `when`） | 多段分岐が要るなら式の拡張。**宣言の境界の実験場** |
| オーナーに対して匿名 | **不可** | サーバーが要る。**やらないと決める** |

---

## オンライン授業シナリオの充足状況

| 要素 | 現設計 | 必要なもの |
|---|---|---|
| 三択問題の定義 | ○ | schema のフィールド型 |
| 生徒がログインして回答 | ○（段階 C） | `auth: "verifiedEmail"` |
| 1 問 1 回答 | ○ | `idFrom`（生徒 uid + 問題 id の複合） |
| **正解が事前に漏れない** | **要追加** | **`gated`（コレクション分割 + `revealed`）** |
| **先生が 1 問ずつ進める** | **要追加** | **`session` ドキュメント** |
| 締切後の回答を弾く | 要追加 | create 条件に `gateOn` |
| **生徒の画面がライブ更新** | **要追加** | **`live: true`** |
| 正答率を見せる | 要追加 | `aggregate` + `on: session.phase == 'revealed'` |
| 生徒は自分の成績のみ | ○ | 行レベル read |
| 先生は全員の成績 | ○ | owner ロール |
| **クラスの生徒だけに限定** | **要追加** | **`participant` ロール** |

---

## 議会投票シナリオの充足状況

| 要素 | 現設計 | 必要なもの |
|---|---|---|
| トピックごとの賛否 | ○ | schema のフィールド型 |
| 議長がトピックを切り替える | ○（S3 で追加） | `session.current` |
| 議員のページが自動で進む | ○（S3 で追加） | `live: true` |
| 一人一票 | ○ | `idFrom`（uid + topicId の複合） |
| **戻って変えられない** | ○ | `finalize: true` + create 条件の `gateOn` |
| **リアルタイムのグラフ** | 要追加 | `aggregate.visibleFrom: "during"`。`peerVisibility: "public"` なら各クライアントが計算 |
| **記名（全員の票が見える）** | **要追加** | **`peerVisibility: "public"`** |
| **記録が改竄されない** | **要追加** | **`immutable: true`** |
| 議員だけが投票できる | ○（S3 で追加） | `participant` ロール |
| 無記名投票 | **不可** | サーバーが要る。**範囲外と明記** |

---

## ルールを凍結する前に決めること（チェックリスト）

ルールは `../mulmoserver` にあり cross-repo のデプロイが要る。**ここに書けないことは製品として
持てない。** 後から足したくなるものを今洗う:

- [ ] アプリ階層（`apps/{aid}/collections/{cid}/items`）— D1
- [ ] コレクション別ロール — D1
- [ ] 公開読み取り（`public.read`）
- [ ] 制約付き create（`public.submit`）と **`auth` の 3 段階**（A 完全匿名 / B 匿名認証 /
      C ログイン必須）— 段階を後から足すとルールのデプロイが要る
- [ ] 申込者の行レベル read（段階 C の「マイ予約」／「自分の回答」）
- [ ] `idFrom`（一人一回）・`finalize`（書き切り／本人による変更の可否）・`window`（期限）
- [ ] `aggregate` の公開先（`results`）を誰が読めるか
- [ ] `mail` キュー（宣言的な副作用）
- [x] フィールド単位の可視性 — **入れる。`gated` によるドキュメント分割**（シナリオ 3 が必須にした）
- [ ] `participant` ロール（名指しされているが member ではない層）。
      **`listed()` と `reader()` を分離すること**
- [ ] `createFields` / `selfUpdate`（**状態別**） / `selfTransitions` の分離
- [ ] `collections[cid].transitions` を **writer にも** 効かせること
- [ ] `idFrom` の有限 enum（`auto` / `auth.uid` / `auth.uid+field`）
- [ ] `apps/{aid}/config`（名簿を含まない公開設定）
- [ ] `auth` の有限 enum（`none` / `anonymous` / `verifiedEmail`）と `emailField` の切り離し
- [ ] `publicOn()` をマスタースイッチにする + `participantRead`
- [ ] `revealGated` は**親を `get()` する**形（従属ドキュメントにフラグは無い）
- [ ] **任意キーの `in` ガード**（`public` / `collections` / `participantRead` /
      `audience` / `selfUpdate` / `selfTransitions` / `emailField` / `window` / `gateOn`）
- [ ] `authed()` と `verified()` の分離（匿名認証が自分の行を読めること）
- [ ] `roleIn()` の `'*'` フォールバックのガード（コレクション別ロールだけのメンバー）
- [ ] `/mail` を `cid` の書き手にも開く
- [ ] `get().data` の前に `exists()`、連結材料に `is string`
- [ ] `list` クエリがルールの条件を写していること（親がクエリを組む）
- [ ] **`/mail` が宣言（`then.email`）を再導出すること** — 宛先・テンプレート・自由文の禁止
- [ ] **`validate` 射影**（`required` / `choiceField` / `choiceValues`）を publish が出すこと
- [ ] `/mail` の決定的 ID と `get() != getAfter()` による**この書き込みでの遷移**の要求
      （**クライアントはバッチで書く**）
- [ ] `audience` は `== "participant"` の厳密一致
- [ ] **authored → published の変換表**を publish が漏れなく実装すること
      （特に `window` の ISO → epoch millis。ルールは文字列を timestamp に変換しない）
- [ ] `session` ドキュメント（主催者が駆動する状態機械）と、それを create 条件に使うこと
- [ ] **`immutable`（owner にも触れない記録）** — ルールの形に関わる
- [ ] `peerVisibility: "public"`（記名投票。参加者が全件読める）
- [ ] **生成 HTML の sandbox iframe 隔離 + View Bridge**（Firestore ハンドルを渡さない）—
      ルールでは守れないので webview 側の構造として最初から。
      **ブリッジは宣言されたデータセット名・アクション名のみを公開し、クエリ言語にしない**
- [ ] 時限アクセス / 「リンクを知っている人は閲覧可」— やるなら今
- [ ] Storage（添付）— `firestore.get()` で同じ members を参照。パスと制約を今決める

---

## 実装順

**基盤**

1. **`(aid, cid)` 同一性** — engine の `(root, slug)` INVARIANT を firestore バックエンドについて外す。
   一番深く、一番先。**これを 2 と 3 と同じ PR にしない**（レビューの性質が違う）
2. **`apps/{aid}` ドキュメント + 静的ルール** — `../mulmoserver` 側の PR が対になる。
   この時点でメンバーはオーナー 1 人。**emulator でルールのユニットテストを書く。**
   ルールの形に関わるものは**すべてここで入れる**（後から足すと cross-repo のデプロイになる）:
   `listed`/`reader` 分離、`participant`、`auth` の 3 段階、`publicOn`、`participantRead`、
   `createFields`/`selfUpdate`/`selfTransitions`、`transitions`、`idFrom` の enum、`gateOn`、
   `immutable`、`peerVisibility`、`revealGated`（親を `get()` する形）、`mail` キュー
3. **store を `(aid, cid)` で書き直す** — PR #2209 の中身がここに入る
4. **discovery の 2 ソース化 + skill materialize** — ディスク ∪ Firestore(memberEmails ∋ 自分)。
   Claude Code はディスクのスキルしか読めないので、購読時に skillText を materialize する
   （`schemaVersion` で張り替えるキャッシュとして）
5. **publish**（git → Firestore、記名 + 事前検証 + 前版保持）
6. **onSnapshot watcher** — `CollectionStore.watch` に載せる。
   `hostRunner.ts:154-184` の実装から `docChanges()` の扱いを持ち込む
7. **worktreeEnv による aid の分岐** — D6

**共有**

8. **招待 UI（email 追加）と viewer / participant ロール** — ここで初めて他人が入る
9. **mulmoserver に webview** — `@mulmoclaude/collection-plugin` を 3 つ目のホストに載せる
10. **スキーマの `.strict()` 化 または 生 JSON リンター** — どちらを取るか決める（上記参照）。
    **新キーを足す前**でないと、書いたキーが黙って消えたまま先に進む
11. **View Bridge**（`@mulmoclaude/core/view-bridge`、親側 + 依存ゼロの子側ライブラリ）—
    **HTML ビューを使うシナリオより前。** 後から入れると既存の HTML が全部書き直しになる

**シナリオを揃える**

12. **公開ページ + App Check** — `auth` の 3 段階を同時に
13. **`then.email` + Trigger Email 拡張**
14. **`schedule` ビュー** → **美容室シナリオが揃う**
15. **`idFrom` / `finalize` / `window` / `aggregate`**（UI と集計側）→ **アンケートシナリオが揃う**
16. **`gated` の分割生成 / `session` / `live` / `aggregate` の `on`** → **授業シナリオが揃う**
17. **`immutable` / `peerVisibility` / `aggregate.visibleFrom`** → **議会シナリオが揃う**

**仕上げ**

18. **スキーマリンター本体** — 10 で決めた土台の上に、検出表の項目を実装
19. **テンプレート 4 種（P1-P4）+ 罠の注記** — 純粋なデータとして。Discover レジストリに乗せる。
    実体は「サンプルのテーブル設計とスキーマ」の 4 セットをそのまま起こす
20. **editor ロール + Storage 添付 + エージェント seed アクションの remote-host チャネル接続**

> 12-17 は HTML ビューを使うので **11 より後**。ルールに関わるものは**すべて 2 に前倒し**して
> あるので、12-17 はホスト側の実装だけになる。

## 未解決の論点

- **emulator テストに上の 4 パターンを含めること** — 3 巡のうち 5 件がこの形。
  4 シナリオが全部通っても、この 1 本が無いと同じ穴が開く
- **スキーマの `.strict()` 化 か、生 JSON リンターか** — `schemaZ.ts` は未知キーを
  バリアントごとに黙って落とすので、新キーは実装が入るまでパースで消え、`mutate` に書いた
  `when` もエラーにならない。**新キーを足す前に決める**（実装順 10）
- **ルールの `hasOnly` / 動的キー参照 / `roleIn` の三項演算**が仕様通り書けるか — emulator で未検証。
  `firebase emulators:exec` でユニットテストを 1 本通してから mulmoserver に入れる
- **Storage ルールから `firestore.get()`** でメンバー判定できるか — 仕様上可能のはずだが実機未確認
- **repo 権限と members のずれ**をどう見せるか（当面は members をヘッダーに常時出すだけ）
- **email の同一性**（変更・再利用）— 当面受容
- **公開ページの URL 設計** — `/{aid}` か、人間可読な slug を別に持つか
- **`then.email` のテンプレート**をどこに置くか（git のリポジトリ内 → publish、が自然か）
