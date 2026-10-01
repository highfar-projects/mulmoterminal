# テンプレート: 定員つきのクラスを、名前を見せずに先着で（ダンス教室）

**いつ使うか** — **1 回の枠に何人まで**、が決まっているもの。ダンス教室の 1 時間 20 人、
ワークショップ、説明会、体験レッスン。訪問者には「残り 3 席」だけが見え、**誰が申し込んだかは
見えません**。承認は要らず、押した人がその場で確定します。

要点は 3 つあります。

**定員を数えない。席を実在させる。** ルールは文書を数えられないので、「20 人まで」を数で
守ることはできません。代わりに**クラス 1 つにつき席の文書を 20 個**作り、1 席ずつを会議室
（[meeting-room.md](./meeting-room.md)）の枠と同じ形で守ります。予約の id を席の id にするので、
2 人目は既に在る文書への書き込みになり、公開の申込み経路は create しか許さないので拒否される。
**21 人目は、空いた席が 1 つも無いので申し込めない** — 定員はそうやって守られます。

**名前を隠すのは `mirror`。** 訪問者が読めるのは `classes` と `seats` だけで、`bookings` は
`public.read` に入っていません。席は `state`（`open` / `taken`）しか持たない**鏡**で、個人の情報を
含まない。「残り N 席」は、ページが `state === "open"` の席を数えて出します。

**順位で見せるジム（[gym.md](./gym.md)）との違い。** ジムは定員を申込み順の順位から導くので、
参加者が互いの申込みを読める必要があります。こちらは読めなくてよい代わりに、**キャンセル待ち
が作れません**（下の「この形が向かないもの」）。

---

## app.json

```json
{
  "aid": "(init が書きます。手で触らないこと)",
  "name": "ダンス教室 クラス予約",
  "slug": "dance-classes",
  "protocol": "1.0.0",
  "members": {
    "owner@dance.example.jp": { "*": "owner" }
  },
  "collections": {
    "bookings": {
      "submitOnly": true,
      "statusField": "status",
      "transitions": { "initial": ["booked"] }
    },
    "seats": { "mirrorOf": "bookings" }
  },
  "views": [
    { "id": "public", "audience": "public", "path": "views/classes.html", "collections": ["classes", "seats"] },
    { "id": "desk", "audience": "member", "path": "views/desk.html", "collections": ["classes", "seats", "bookings"] },
    { "id": "mine", "audience": "participant", "path": "views/mine.html", "collections": ["bookings"] }
  ],
  "public": {
    "enabled": true,
    "read": ["classes", "seats"],
    "submit": {
      "bookings": {
        "auth": "verifiedEmail",
        "emailField": "requesterEmail",
        "createFields": ["requesterName", "requesterEmail", "seat", "status"],
        "initialStatus": "booked",
        "idFrom": "field",
        "idField": "seat",
        "idIn": { "collection": "seats", "where": { "field": "state", "equals": "open" } },
        "mirror": "seats",
        "window": {
          "fromField": { "ref": "seat", "collection": "seats", "field": "opensAt" },
          "untilField": { "ref": "seat", "collection": "seats", "field": "closesAt" }
        },
        "selfDelete": ["booked"]
      }
    }
  }
}
```

**`window` は席を見ます。クラスではありません。** 受付の締切はクラスごとに決まるものですが、
`ref` に `classId` のような**訪問者が送るフィールド**を使うと、ルールはそれが席のクラスと同じかを
確かめません。締切の過ぎたクラスの席を、受付中の別クラスの名前を添えて取れてしまう。席の id は
`idIn` が実在を確かめ、予約の id そのものなので、こちらは偽れません。だから **`opensAt` /
`closesAt` はクラスの全席に同じ値を写して**持たせます（下の「席の補充」）。

**`createFields` にクラスは入りません。** 席が知っています。受付の画面は席を引けばクラスが
分かり、予約に書かせた値より正確です。

**`requesterEmail` は `public.read` に入らない `bookings` にだけ在ります。** これを読めるのは
ロールを持つ人と本人だけです。

**1 人が 2 席取ることは止めません。** 席を 1 つずつ守る形なので、同じ人が 2 回押せば 2 席に
なります。止めたいなら、ページに「お一人様 1 席」と書き、受付が `/m/` で重複を消してください。

## .claude/skills/classes/schema.json

```json
{
  "title": "クラス",
  "icon": "groups",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "title": { "type": "string", "label": "クラス名", "required": true },
    "startAt": { "type": "datetime", "label": "開始", "required": true },
    "teacher": { "type": "string", "label": "講師" }
  }
}
```

**定員はクラスに書きません。** 定員とは「席が何個あるか」で、それ以外の数を持つと、席の数と
食い違ったときにどちらが本当か分からなくなります。ページは席を数えて定員を出します。

## .claude/skills/seats/schema.json

```json
{
  "title": "席",
  "icon": "event_seat",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "classId": { "type": "ref", "label": "クラス", "to": "classes", "required": true },
    "opensAt": { "type": "number", "label": "受付開始（epoch millis）", "required": true },
    "closesAt": { "type": "number", "label": "受付締切（epoch millis）", "required": true },
    "state": { "type": "enum", "label": "状態", "values": ["open", "taken"], "required": true }
  }
}
```

**席の id はクラスの id に番号を付けたもの**にします（`sat-1000-2026-10-03-01` 〜 `-20`）。
予約の id がこの id になるので、読める形にしておくと受付が楽です。

## .claude/skills/bookings/schema.json

```json
{
  "title": "クラス予約",
  "icon": "how_to_reg",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "requesterName": { "type": "string", "label": "お名前", "required": true },
    "requesterEmail": { "type": "email", "label": "メール", "required": true },
    "seat": { "type": "string", "label": "席", "required": true },
    "status": { "type": "enum", "label": "状態", "values": ["booked"] }
  }
}
```

## views/classes.html — 公開のクラス一覧と「残り N 席」

**ページが選ぶのは「どの席か」で、訪問者が選ぶのは「どのクラスか」です。** 押されたクラスの
空いている席から 1 つを**ランダムに**選んで申し込みます。先頭の席を選ぶと、同時に押した人が
全員同じ席を取りに行き、1 人以外が全員弾かれるからです。

**弾かれたら、ページは自動で再送しません。** 申込みは押した回数だけ確認ダイアログが出るもので、
ページが勝手に 2 回目を送ると、訪問者が見ていない確認が増えます。弾かれた席を覚えておき、
**次に押したときは別の席を選ぶ**。訪問者にはそう書きます。

The colours below all come from one `--hue`, and **it is meant to be changed** — this one is
this template's, not your app's. The rules behind the sheet are in [design.md](./design.md).

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 350;                                    /* rose - a studio floor, filling up */
    --main: oklch(50% .12 var(--hue));           --fill: oklch(96% .02 var(--hue));
    --line: oklch(50% .12 var(--hue) / .16);     --ink: oklch(23% .015 var(--hue));
    --muted: oklch(53% .02 var(--hue));          --paper: oklch(99.4% .007 85);
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 44rem; padding: 28px 18px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  h1 { margin: 0 0 18px; font-size: clamp(23px, 5vw, 31px); line-height: 1.2; letter-spacing: -.03em; }
  label { display: block; margin: 0 0 14px; color: var(--muted); font-size: 13px; font-weight: 750; }
  input { display: block; width: min(22rem, 100%); margin-top: 6px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: inherit; }
  input:focus { border-color: var(--main); outline: 2px solid var(--line); }
  button { min-height: 38px; padding: 8px 14px; border: 0; border-radius: 10px; background: var(--main); color: var(--paper); font: inherit; font-weight: 750; cursor: pointer; touch-action: manipulation; }
  #list > div, #mine li, #rows > div { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0 0 8px; padding: 13px 15px; border: 1px solid var(--line); border-radius: 14px; background: var(--fill); }
  .left { margin-left: auto; color: var(--main); font-weight: 750; }
  .full { margin-left: auto; color: var(--muted); font-weight: 750; }
  ul { margin: 0; padding: 0; list-style: none; }
  #say { min-height: 1.6em; margin: 14px 0 0; color: var(--main); font-size: 13px; font-weight: 700; }
</style>
<h1>クラス予約</h1>
<label>お名前 <input id="who" maxlength="40" /></label>
<p id="say" role="status"></p>
<div id="list"></div>
<script>
  const view = window.__MC_APP_VIEW;
  const list = document.getElementById("list");
  const who = document.getElementById("who");
  const say = document.getElementById("say");
  // 弾かれた席。次に押したときはここに無い席を選ぶ。ページを開き直すと忘れてよい。
  const refused = new Set();
  let latest = { classes: [], seats: [] };

  const openSeatsOf = (classId) => latest.seats.filter((seat) => seat.classId === classId && seat.state === "open");

  const pickSeat = (classId) => {
    const open = openSeatsOf(classId);
    const untried = open.filter((seat) => !refused.has(seat.id));
    const pool = untried.length > 0 ? untried : open;
    return pool[Math.floor(Math.random() * pool.length)]?.id;
  };

  const draw = () => {
    const shown = latest.classes
      .filter((lesson) => latest.seats.some((seat) => seat.classId === lesson.id))
      .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
    list.replaceChildren(
      ...shown.map((lesson) => {
        // textContent と dataset。クラス名は人が入力するもので、文字列連結で
        // innerHTML に入れると公開ページでそれが動きます。
        const row = document.createElement("div");
        const title = document.createElement("span");
        title.textContent = `${lesson.startAt} ${lesson.title}`;
        const total = latest.seats.filter((seat) => seat.classId === lesson.id).length;
        const left = openSeatsOf(lesson.id).length;
        const count = document.createElement("span");
        count.className = left === 0 ? "full" : "left";
        count.textContent = left === 0 ? `満席（定員 ${total}）` : `残り ${left} 席 / 定員 ${total}`;
        row.append(title, count);
        if (left > 0) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.lesson = lesson.id;
          button.textContent = "申し込む";
          row.append(button);
        }
        return row;
      }),
    );
  };

  view.onState(({ classes = [], seats = [] }) => {
    latest = { classes, seats };
    draw();
  });

  list.addEventListener("click", async (event) => {
    const lesson = event.target.dataset?.lesson;
    if (!lesson) return;
    // requesterName は createFields にあり、スキーマで required。空文字は拒否されるので、
    // 送る前に見ます。
    const requesterName = who.value.trim();
    if (requesterName === "") {
      say.textContent = "お名前を入れてください。";
      who.focus();
      return;
    }
    const seat = pickSeat(lesson);
    if (!seat) {
      say.textContent = "満席です。";
      return;
    }
    const result = await view.submit("bookings", { seat, requesterName, status: "booked" });
    if (result.ok) {
      say.textContent = "申し込みました。";
      return;
    }
    // 確認ダイアログで「やめる」を押した人には何も出しません。失敗ではないので。
    if (result.error === "cancelled") {
      say.textContent = "";
      return;
    }
    // 失敗を全部「満席」と言わないこと。締切、サインイン、必須項目のどれでもここに来ます。
    refused.add(seat);
    const reason = result.error ? `申し込めませんでした: ${result.error}` : "申し込めませんでした。";
    say.textContent = `${reason} 席が先に埋まった場合は、もう一度押すと別の席で申し込みます。`;
  });
  view.ready();
</script>
```

- **数えるのは `state === "open"` の席だけ。** 席の `state` は鏡で、ルールが「予約があるなら
  `taken`、無いなら `open`」以外を拒むので、ページが数えてよい値です
- **弾かれた席は数から引きません。** 弾かれた理由が締切やサインインのこともあるので、それで
  「残り」を減らすと、空いている席を訪問者に満席と見せることになります。覚えておくのは
  「次に選ばない」ことだけ
- **公開ページは動きません。** 公開申込みのあるコレクションや鏡を `live` にすると、訪問者全員が
  全申込みを見張ることになり、publish が拒否します。「残り」はページを開いたときと、自分が申し
  込んだ後に更新されます。予約開始の瞬間に人が集まるクラスなら、そうページに書いてください

## views/mine.html — 自分の予約と、取り下げ

`audience: "participant"`、入口は `/p/{slug}`。取り下げると、**予約の削除と席の再オープンが
1 つのバッチ**になり、その席はすぐ他の人が取れるようになります。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 350;                                    /* rose - a studio floor, filling up */
    --main: oklch(50% .12 var(--hue));           --fill: oklch(96% .02 var(--hue));
    --line: oklch(50% .12 var(--hue) / .16);     --ink: oklch(23% .015 var(--hue));
    --muted: oklch(53% .02 var(--hue));          --paper: oklch(99.4% .007 85);
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 44rem; padding: 28px 18px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  button { min-height: 38px; padding: 8px 14px; border: 0; border-radius: 10px; background: var(--main); color: var(--paper); font: inherit; font-weight: 750; cursor: pointer; touch-action: manipulation; }
  ul { margin: 0; padding: 0; list-style: none; }
  #mine li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0 0 8px; padding: 13px 15px; border: 1px solid var(--line); border-radius: 14px; background: var(--fill); }
  #say { min-height: 1.6em; margin: 14px 0 0; color: var(--main); font-size: 13px; font-weight: 700; }
</style>
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
        row.textContent = `${booking.seat} — ${booking.status}`;
        if (withdrawable.includes(booking.status)) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.id = booking.id;
          button.textContent = "取り消す";
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
    // 確認はページの中で。confirm() はサンドボックスに無視されます。
    // 1 回目は文言を変えるだけ、2 回目で書きます。
    if (button.dataset.armed !== "yes") {
      button.dataset.armed = "yes";
      button.textContent = "取り消す（席はすぐ他の人が取れるようになります）";
      return;
    }
    const result = await view.withdraw("bookings", id);
    if (!result.ok) say.textContent = result.error ? `取り消せませんでした: ${result.error}` : "取り消せませんでした。";
  });
  view.ready();
</script>
```

**取り消しに締切はありません。** `selfDelete` は受付の `window` を見ないので、クラスが終わった後
でも本人は取り消せます。「前日までは取り消し可」のような決まりは、今はページに書いて受付が
運用で守るしかありません。

## views/desk.html — 受付の画面

`audience: "member"`、入口は `/m/{slug}`。**名前が見えるのはここだけ**です。クラスごとに、
申し込んだ人の名前と残りの席数を出します。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 350;                                    /* rose - a studio floor, filling up */
    --main: oklch(50% .12 var(--hue));           --fill: oklch(96% .02 var(--hue));
    --line: oklch(50% .12 var(--hue) / .16);     --ink: oklch(23% .015 var(--hue));
    --muted: oklch(53% .02 var(--hue));          --paper: oklch(99.4% .007 85);
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 44rem; padding: 28px 18px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  h2 { margin: 22px 0 8px; font-size: 17px; }
  ul { margin: 0; padding: 0; list-style: none; }
  #rows > div { margin: 0 0 8px; padding: 13px 15px; border: 1px solid var(--line); border-radius: 14px; background: var(--fill); }
  .left { color: var(--main); font-weight: 750; }
</style>
<div id="rows"></div>
<script>
  const view = window.__MC_APP_VIEW;
  const rows = document.getElementById("rows");
  view.onState(({ classes = [], seats = [], bookings = [] }) => {
    // 予約はクラスを持たない。席の id が予約の id なので、席からクラスを引きます。
    const classOfSeat = Object.fromEntries(seats.map((seat) => [seat.id, seat.classId]));
    rows.replaceChildren(
      ...[...classes]
        .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)))
        .map((lesson) => {
          const block = document.createElement("div");
          const heading = document.createElement("h2");
          heading.textContent = `${lesson.startAt} ${lesson.title}`;
          const total = seats.filter((seat) => seat.classId === lesson.id).length;
          const booked = bookings.filter((booking) => classOfSeat[booking.seat] === lesson.id);
          const count = document.createElement("p");
          count.className = "left";
          count.textContent = `${booked.length} / ${total} 人`;
          const names = document.createElement("ul");
          names.replaceChildren(
            ...booked.map((booking) => {
              const item = document.createElement("li");
              item.textContent = `${booking.requesterName ?? ""}（${booking.requesterEmail ?? ""}）`;
              return item;
            }),
          );
          block.append(heading, count, names);
          return block;
        }),
    );
  });
  view.ready();
</script>
```

---

## 席の補充 — 作る前にユーザーへ言うこと

席は自動では生えません。**クラスを 1 つ作るたびに、そのクラスの席を定員の数だけ**作ります。
やり方は会議室の「枠の補充」（[meeting-room.md](./meeting-room.md)）と同じで、決定的な
スクリプトでファイルに書き出し、`manageCollection` `putItems` の `itemsFile` に
**`mode: "create"`** で渡します。違いは 3 つです。

- **1 クラス = クラス 1 行 + 席 N 行。** 席の各行は `id` / `classId` / `opensAt` / `closesAt` /
  `state: "open"` を揃えた完全なレコードにすること
- **`opensAt` / `closesAt` はクラスの全席に同じ値を写す。** 受付の締切を変えるときも全席を
  書き直します。1 席だけ古い値が残ると、その席だけ締切後も取れます
- **件数が増えます。** 週 30 コマ × 20 席なら週 600 行。`putItems` は 1 回 1000 行までなので、
  それを超える週はファイルを分けること。公開ページは全クラスの全席を読むので、**終わった
  クラスの席は掃除**してください — ただし予約が入っている席を消すと予約の鏡が宙に浮くので、
  「予約が存在しない席だけ」に限ること

**定員を増やすのは席を足すだけ**です（`-21`, `-22` …）。**減らすのは空いている席を消すことで、
予約が入っている席は消さない**こと。

## この形が向かないもの

- **キャンセル待ち。** 満席の後に並ぶ場所がありません。並ばせたいなら、順位で見せるジム
  （[gym.md](./gym.md)）を使ってください。代わりに参加者同士が申込みを読める形になります
- **「お一人様 1 席」の強制。** 表示はできても強制はできません
- **取り消しの締切**（「前日まで」）。上の `views/mine.html` の注を参照
- **席を選ばせる**（映画館の座席表）。これは会議室と同じ形で、席を訪問者に選ばせれば書けます
  — その場合は `views/classes.html` の `pickSeat` の代わりに席のボタンを並べてください
