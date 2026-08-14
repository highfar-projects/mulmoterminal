# テンプレート: 枠を予約して自分で取り消す（会議室）

**いつ使うか** — **貸せる単位を前もって列挙できる**もの。会議室、席、機材の貸出、駐車場、
面談枠。「誰が担当か」で権限が変わる美容室（[salon.md](./salon.md)）とも、定員を順位で
見せるジム（[gym.md](./gym.md)）とも違い、**承認が要らず、押した人がその場で確定する**形です。

要点は 3 つあります。

**枠を実在させ、予約の id を枠の id にする。** 二重予約は「フィールドの検査」ではなく
**ドキュメント id の衝突**で防ぎます。2 人目の書き込みは既に在るドキュメントへの書き込みに
なり、公開の申込み経路は create しか許していないので拒否される。

**連続 2 コマは 2 件の申込みで、まとめて取ることはできません。** ビューが呼べるのは 1 件ずつの
`submit()` だけで、複数を 1 つの書き込みにする API はありません。1 コマ目が通って 2 コマ目が
取られている、という中途半端な結果は起こりえます。刻み幅を会議の実態に合わせる（60 分会議が
多いなら 60 分枠にする）か、2 コマ目が取れなかったら 1 コマ目を取り下げるようページに書く
（下の `withdraw`）か、どちらかを最初に決めてください。

**承認しない。** `initialStatus` を確定の状態にして、遷移は「取り消し」だけ。受付は必要な
ときだけ介入します。

**枠は誰かが作らなければ無くなる。** ここが会議室でいちばん事故る場所なので、下に
「枠の補充」の節を置きました。**作る前にユーザーへ言うこと**でもあります。

---

## app.json

```json
{
  "aid": "(init が書きます。手で触らないこと)",
  "name": "本社 会議室",
  "slug": "hq-rooms",
  "members": {
    "facility@example.co.jp": { "*": "owner" },
    "reception@example.co.jp": { "bookings": "editor", "slots": "editor", "rooms": "viewer" }
  },
  "collections": {
    "bookings": {
      "submitOnly": true,
      "statusField": "status",
      "transitions": { "initial": ["booked"] }
    },
    "slots": { "mirrorOf": "bookings" }
  },
  "views": [
    { "id": "public", "audience": "public", "path": "views/grid.html", "collections": ["rooms", "slots"] },
    { "id": "desk", "audience": "member", "path": "views/desk.html", "collections": ["bookings", "slots"] },
    { "id": "mine", "audience": "participant", "path": "views/mine.html", "collections": ["bookings"] }
  ],
  "public": {
    "enabled": true,
    "read": ["rooms", "slots"],
    "submit": {
      "bookings": {
        "auth": "verifiedEmail",
        "emailField": "requesterEmail",
        "createFields": ["requesterName", "requesterEmail", "slot", "purpose", "attendees", "status"],
        "initialStatus": "booked",
        "idFrom": "field",
        "idField": "slot",
        "idIn": { "collection": "slots", "where": { "field": "state", "equals": "open" } },
        "mirror": "slots",
        "window": {
          "fromField": { "ref": "slot", "collection": "slots", "field": "opensAt" },
          "untilField": { "ref": "slot", "collection": "slots", "field": "closesAt" }
        },
        "selfUpdate": { "booked": ["purpose", "attendees"] },
        "selfDelete": ["booked"]
      }
    }
  }
}
```

**申込みの宣言は丸ごと書いてください。** `idFrom` と `idField` だけの短い版は publish が
拒否します（`idIn` が無ければ、実在しない枠の予約が黙って通る）。

**`createFields` に `room` は入りません。** `ref` 型のフィールドは公開ページに描けない
（訪問者が読めるのは publish されたフォームだけで、参照先のスキーマは読めない）ので、
`check` が拒否します。会議室予約ではそもそも不要です — 予約の id が枠の id で、部屋は
**枠のほうが持っている**。受付の画面は枠を引けば部屋が分かります。

`window` は「その枠の受付はいつ開いていつ閉じるか」です。会議室なら「30 日前から開始 10 分前
まで」。ルールは日付の計算ができないので、**枠を作る側が epoch millis で入れます**。

## .claude/skills/bookings/schema.json

```json
{
  "title": "会議室予約",
  "icon": "meeting_room",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "requesterName": { "type": "string", "label": "予約者", "required": true },
    "requesterEmail": { "type": "email", "label": "メール", "required": true },
    "room": { "type": "ref", "label": "部屋", "to": "rooms" },
    "slot": { "type": "string", "label": "枠", "required": true },
    "purpose": { "type": "string", "label": "用件" },
    "attendees": { "type": "number", "label": "人数" },
    "status": { "type": "enum", "label": "状態", "values": ["booked"] }
  }
}
```

## .claude/skills/slots/schema.json

```json
{
  "title": "枠",
  "icon": "schedule",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "room": { "type": "ref", "label": "部屋", "to": "rooms" },
    "startAt": { "type": "datetime", "label": "開始", "required": true },
    "opensAt": { "type": "number", "label": "受付開始（epoch millis）", "required": true },
    "closesAt": { "type": "number", "label": "受付締切（epoch millis）", "required": true },
    "state": { "type": "enum", "label": "状態", "values": ["open", "taken"], "required": true }
  }
}
```

**主キーは合成スラッグ**にします（`roomA-2026-08-20-1000`）。予約の id がこの id になるので、
読める形にしておくと運用が楽です。刻み幅（30 分か 60 分か）は**あとから変えられません** —
既にある枠の id が変わってしまうため。最初にユーザーへ確認してください。

`rooms` は普通のコレクション（`storage: {"type":"firestore"}` を足すだけ）。部屋名、定員、
設備、階。

## views/grid.html — 公開の空き枠グリッド

**`prompt` も `alert` も `confirm` も動きません。** ビューは `sandbox="allow-scripts"` の中で、
`allow-modals` が無いので呼び出しは無視されます（コンソールに `Ignored call to 'prompt()'.` と
出るだけで、例外にはなりません）。名前は**ページの中の `<input>`** で訊き、結果は**ページの中の
要素**に書きます。

```html
<label>お名前 <input id="who" maxlength="40" /></label>
<label>用件 <input id="why" maxlength="60" /></label>
<p id="say" role="status"></p>
<div id="grid"></div>
<script>
  const view = window.__MC_APP_VIEW;
  const grid = document.getElementById("grid");
  const who = document.getElementById("who");
  const why = document.getElementById("why");
  const say = document.getElementById("say");
  view.onState(({ rooms = [], slots = [] }) => {
    const name = Object.fromEntries(rooms.map((room) => [room.id, room.title ?? room.id]));
    grid.replaceChildren(
      ...slots
        .filter((slot) => slot.state === "open")
        .map((slot) => {
          // textContent と dataset。レコードの値を文字列連結で innerHTML に
          // 入れないこと — 部屋名は人が入力するもので、そこに <script> と
          // 書かれたら公開ページで動きます。
          const button = document.createElement("button");
          button.dataset.slot = slot.id;
          button.textContent = `${slot.startAt} ${name[slot.room] ?? ""}`;
          return button;
        }),
    );
  });
  grid.addEventListener("click", async (event) => {
    const slot = event.target.dataset?.slot;
    if (!slot) return;
    // requesterName は createFields にあり、スキーマで required。空文字は
    // 拒否されるので、送る前に見ます。
    const requesterName = who.value.trim();
    if (requesterName === "") {
      say.textContent = "お名前を入れてください。";
      who.focus();
      return;
    }
    const result = await view.submit("bookings", { slot, requesterName, purpose: why.value.trim(), status: "booked" });
    if (result.ok) {
      say.textContent = "予約しました。";
      return;
    }
    // 失敗を全部「取られました」と言わないこと。締切、サインイン、必須項目の
    // どれでもここに来ます。理由は result.error にあります。
    say.textContent = result.error ? `予約できませんでした: ${result.error}` : "その枠は取られました。";
  });
  view.ready();
</script>
```

3 つだけ守れば形は自由です。

- **`ready()` を最後に呼ぶ。** 呼ばないとデータは永久に来ません
- **送るのは文字列だけ。** `values` に数値や真偽値が 1 つでも混ざると、部分的に無視される
  のではなく**メッセージ全体が申込みでなくなり**、`not-a-submission` として拒否されます
  （人数は `String(n)` で送ること）
- **モーダルを使わない。** `prompt` / `alert` / `confirm` はサンドボックスが無視します。
  訊くのも報せるのもページの中の要素で
- **`submit()` の結果を見て、失敗を 1 つの文言にまとめない。** 二重予約だけでなく、
  受付の締切（`window`）、サインインしていない、必須項目が空、のどれでも `ok: false` で
  返ります。全部を「その枠は取られました」と言うと、直せる失敗が直せなくなる — 理由は
  `result.error` にあります
- **`requesterEmail` は送らない。** サインインした訪問者のアドレスを親が入れます

**押した瞬間には書き込まれません。** 親が値を iframe の外に描いて確認を取り、訪問者が
押してから書きます。ビューの HTML は信頼されていないためで、読み込んだ瞬間に `submit()` を
呼ぶページがあっても勝手に予約は入りません。

## views/mine.html — 自分の予約と、取り下げ

`audience: "participant"`、入口は `/p/{slug}`。**ここに取り下げのボタンを描かないと、
本人には取り消す手段が何もありません** — このテンプレートは本人の状態遷移を持たないので
（下の「取り消しには 2 通りある」）、`withdraw` がその唯一の出口です。

`viewer.can.<cid>.withdrawFrom` は**取り下げてよい状態の一覧**で、真偽値ではありません。
その状態にある行にだけボタンを出します。

```html
<ul id="mine"></ul>
<p id="say" role="status"></p>
<script>
  const view = window.__MC_APP_VIEW;
  const list = document.getElementById("mine");
  const say = document.getElementById("say");
  view.onState(({ bookings = [] }, viewer = {}) => {
    const withdrawable = viewer.can?.bookings?.withdrawFrom ?? [];
    list.replaceChildren(
      ...bookings.map((booking) => {
        const row = document.createElement("li");
        row.textContent = `${booking.slot} ${booking.purpose ?? ""} — ${booking.status}`;
        if (withdrawable.includes(booking.status)) {
          const button = document.createElement("button");
          button.dataset.id = booking.id;
          button.textContent = "取り下げる";
          row.append(button);
        }
        return row;
      }),
    );
  });
  list.addEventListener("click", async (event) => {
    const button = event.target;
    const id = button.dataset?.id;
    if (!id) return;
    // 確認はページの中で。confirm() はサンドボックスに無視され、false が
    // 返るので、「確認しているつもりで何も起きないボタン」になります。
    // 1 回目は文言を変えるだけ、2 回目で書きます。
    if (button.dataset.armed !== "yes") {
      button.dataset.armed = "yes";
      button.textContent = "取り下げる（枠はすぐ他の人が取れるようになります）";
      return;
    }
    const result = await view.withdraw("bookings", id);
    if (!result.ok) say.textContent = result.error ? `取り下げられませんでした: ${result.error}` : "取り下げられませんでした。";
  });
  view.ready();
</script>
```

- **`withdraw` は行き先を持ちません。** 行が消えるので、動く先がない
- **戻せません。** 取り下げた瞬間に枠は他の人のものになりうるので、確認は**ページが**出す
  こと（参加者の操作に親は確認を挟みません）。ただし `confirm()` は使えません —
  サンドボックスが無視するので、押しても何も起きないボタンになります
- **`can.withdrawFrom` が空なら宣言していないということ。** `selfDelete` を書いていないか、
  ルールがまだ deploy されていないか、アプリを publish し直していないかのいずれかです

## views/desk.html — 受付の画面

`audience: "member"`、入口は `/m/{slug}`。**ロールを持つ人だけ**が読めるドキュメントに
publish されます。総務の Mac が閉じたままでも、受付が自分のスマホでその日の予約を見られる、
というのがこれの目的です。

契約は公開ビューと同じ（`window.__MC_APP_VIEW` / `onState` / `ready`）。渡されるものだけが
違い、`collections` に書いたものが**その人の資格情報で**読まれます。

---

## 取り消しには 2 通りある — **混ぜないこと**

排他は「枠の id = 予約の id」で成立しているので、**状態を `cancelled` にしただけでは枠は
空きません**。ドキュメントが残り、id を握ったままだからです。

| やり方 | 何が起きるか | 枠 | 記録 | 通知 |
|---|---|---|---|---|
| **状態遷移**（`selfTransitions` で `cancelled` へ） | 状態が変わるだけ | **空かない**（受付が消すまで） | 残る | 出せる |
| **取り下げ**（`selfDelete`） | **行が消える** | **その場で開く** | 残らない | 出せない |

**両方を本人に渡してはいけません。** このテンプレートが `selfTransitions` を持たないのは
そのためです。両方あると、本人が先に「取り消し」を押した時点で行は `cancelled` になり、
`selfDelete: ["booked"]` はもうその行に効きません — **本人の操作で、受付にしか片づけられない
枠ができてしまう**。しかも `withdraw` を描いていないページや、宣言より古い publish 済みの
ページからでも、`transition` は文書化された呼び出しとして通ります。
どちらか一方だけを宣言してください。

- **押したら空いてほしい**（会議室、席、機材）→ このテンプレートのまま。`transitions` は
  `initial` だけ、状態は `booked` の 1 つ、本人の出口は `withdraw` だけ
- **記録を残したい**（有料の貸出、社外向け、無断キャンセルの常習を見たい）→ `selfDelete` を
  書かず、`selfTransitions` で `cancelled` に落とす形（美容室の
  [salon.md](./salon.md) がそれ）。枠を空けるのは受付の操作になるので、**「取り消しは即時、
  枠が再び開くのは受付が処理してから」と最初に言うこと**

`selfDelete` を入れると、本人の取り下げは**削除と枠の再オープンが 1 つのバッチ**になります。
片方だけの書き込みはルールが拒否するので、「予約は消えたのに枠は埋まったまま」も
「枠は開いたのに予約が残っている」も作れません。

**メールが出せないのは仕組み上の限界**です。メールの規則は書き込み後の文書を読んで
「その遷移が本当に起きた」を確かめるので、消える行には束ねようがありません。

設計と経緯は MulmoTerminal の `plans/feat-shared-app-self-delete.md`。

## 枠の補充 — 作る前にユーザーへ言うこと

枠は自動では生えません。10 部屋 × 30 分刻み × 90 日で数万件を、**申込みが来る前に**実体化
しておく必要があります。プラットフォームはアプリごとのサーバコードを持たないので、これは
アプリの外の仕事です。

現実的なやり方は、MulmoTerminal のスケジューラ（`<ws>/config/scheduler/tasks.json`）に週次
タスクを 1 本置くことです。発火するとチャットが立ち上がり、プロンプトの指示を実行します。

> 1. `slots` の最遠日を報告する。30 日未満なら警告として目立たせる
> 2. 今日から 90 日先までで、**まだ存在しない枠の id だけ**を作る
> 3. 休業日・祝日は作らない（一覧は設定ファイルから読む）
> 4. 作った件数と、新しい最遠日を報告する

これは著者のマシンを**実行経路に入れるものではありません**。訪問者の予約は Firestore と
話すだけで成立し、Mac がやるのは在庫を積むことだけ。90 日分を週次で補充するなら、Mac が
12 週間止まって初めて予約が止まります。

4 つ注意があります。

- **日付を LLM に数えさせない。** 生成は決定的なスクリプトにやらせ、LLM の仕事は例外の判断
  （祝日、臨時休業、部屋の閉鎖）と報告に寄せる。DST と月末で必ずずれます
- **毎回 90 日を作り直さない。** 足りない末尾だけ作れば週 1,000 件程度で済み、既存の
  ドキュメントに触らずに済みます
- **再実行は `state` については安全です。** `mirrorOf` のルールが「予約があるなら taken、
  無いなら open」以外の値を拒むので、暴走しても予約済みの枠を `open` に戻せません。ただし
  `opensAt` / `closesAt` にその保護は無いので、**既存の id はスキップ**すること
- **古い枠の掃除には穴があります。** `slots` には `submit` が無いため、予約が入っている枠の
  ドキュメントも削除できてしまい、予約側の鏡が宙に浮きます。消すなら「予約が存在しない
  過去の枠だけ」に限ること

## この形が向かないもの

宣言では**書けない**ので、頼まれたら先に言ってください。

- **任意の開始時刻・可変長**（10:15〜11:40）。区間の重なり判定はルールに書けません。離散的な
  枠に切れるなら書ける、というのが唯一の道です
- **定員 2 人以上の枠**（グループ室、講座）。件数は数えられません。ジム
  （[gym.md](./gym.md)）の「順位で見せる」が別解ですが、あちらは強制ではありません
- **「一人あたり同時 2 件まで」**。同じ理由で、表示はできても強制はできません
- **空いている部屋の自動割り当て**。クエリが要ります
