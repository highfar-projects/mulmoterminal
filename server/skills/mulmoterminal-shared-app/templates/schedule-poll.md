# テンプレート: 日程調整（候補日に ○△× を付けて、全員の表を見る）

**いつ使うか** — 幹事が候補日を並べてリンクを送り、参加者がそれぞれの日に ○・△・× を付ける
もの。飲み会、打ち合わせ、練習日、面談の日程。調整さんや Doodle と同じことをします。

- 参加者は**サインイン画面なし**で答えられる（`auth: "anonymous"`）
- **全員の回答が表になって並ぶ**。誰が来られるかを全員が見るのがこの道具の目的なので、
  名前は見えて構いません — 予約（[class-seats.md](./class-seats.md)）とはそこが逆です
- 一度出した回答を**本人があとから直せる**（`selfUpdate`）
- 幹事が**締め切る**と、新しい回答も直しも止まる（`window.untilField`）

要点は 2 つあります。

**1 人 1 件はルールが守ります。** 回答の id は「このアプリでの本人の匿名 id + `"_"` + pollId」
（`idFrom: "pseudonym+field"`。匿名 id は uid とアプリ id のハッシュ）で、同じ日程調整に 2 回目を
出すと既に在る文書への create になり、拒否されます。ページの「直す」ボタンは、それを避けて
**同じ文書を書き換える**ためのものです。

**候補日はフィールドにしない。** 日程調整ごとに候補日の数が違い、`createFields` は固定の一覧
なので、「1 日 1 フィールド」は宣言できません。全部の印を **1 つの文字列 `marks`** に、候補日の
順に 1 文字ずつ入れます（`"○△×○"`）。

---

## app.json

```json
{
  "aid": "(init が書きます。手で触らないこと)",
  "name": "日程調整",
  "slug": "schedule",
  "protocol": "3.0.0",
  "members": {
    "organizer@example.jp": { "*": "owner" }
  },
  "collections": {
    "answers": {
      "submitOnly": true,
      "statusField": "status",
      "transitions": { "initial": ["answered"] }
    }
  },
  "views": [
    { "id": "public", "audience": "public", "path": "views/poll.html", "collections": ["polls", "answers"] },
    { "id": "desk", "audience": "member", "path": "views/desk.html", "collections": ["polls", "answers"], "live": ["answers"] }
  ],
  "public": {
    "enabled": true,
    "read": ["polls", "answers"],
    "submit": {
      "answers": {
        "auth": "anonymous",
        "idFrom": "pseudonym+field",
        "idField": "pollId",
        "createFields": ["pollId", "name", "marks", "comment", "status"],
        "initialStatus": "answered",
        "validate": { "required": ["pollId", "name", "marks"] },
        "window": {
          "untilField": { "ref": "pollId", "collection": "polls", "field": "closesAt" }
        },
        "selfUpdate": { "answered": ["name", "marks", "comment"] }
      }
    }
  }
}
```

**`idFrom: "pseudonym+field"`（`protocol: "3.0.0"`）** — 回答は全員に見えるので、id に uid を
そのまま使うと、同じ人が別のアプリで残した名前付きの行と uid で突き合わせられます。匿名 id は
アプリごとに違う値なので、それができません。1 人 1 件の守りは `auth.uid+field` と同じです。
この決め方を読めるのは 3.0.0 以降の読み手なので、`protocol` もそう宣言します。

**`auth: "anonymous"`** — サインイン画面を出さずに答えられます。**Firebase コンソールで
Anonymous プロバイダを有効にする**必要があり、これはリポジトリからはできません（プロジェクト
ごとに 1 回）。代償は、**身元がブラウザ単位**であること。別の端末からは自分の回答を直せず、
新しい回答になります。それが困るなら `"verifiedEmail"` にすると、Google のサインイン 1 回と
引き換えにアカウント単位になります。

**`emailField` を置かないこと。** `answers` は `public.read` に入っているので、行は丸ごと全員に
見えます。メールアドレスを持たせると、それも全員に見えます。

**`submitOnly: true`** — 幹事を含め、ロールを持つ人は回答を作れません。回答は参加者の申込み
だけで、幹事が誰かの代わりに印を付けて水増しすることはできない。

**`window.untilField` が締め切りです。** 新しい回答だけでなく、**直す書き込みも**同じ締切で
止まります。ルールは日付の計算ができないので、`closesAt` は epoch millis の **number** で
日程調整の行に入れます。

**`selfUpdate` は状態ごとの宣言**なので、状態が 1 つ（`answered`）でも `statusField` が要ります。
`pollId` が一覧に無いのは、別の日程調整へ回答を移せないようにするためです（id が `pollId` から
作られているので、移せても id と中身が食い違う）。

## .claude/skills/polls/schema.json

```json
{
  "title": "日程調整",
  "icon": "event_available",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "title": { "type": "string", "label": "タイトル", "required": true },
    "dates": { "type": "string", "label": "候補日（1 行に 1 つ）", "required": true },
    "note": { "type": "string", "label": "メモ" },
    "closesAt": { "type": "number", "label": "締切（epoch millis）", "required": true }
  }
}
```

**`dates` は 1 行に 1 つ**（`10/3(金) 19:00\n10/4(土) 18:00`）。**回答が付いた後に候補日を
並べ替えたり途中を消したりしないこと** — 印は「何番目の候補日か」で対応しているので、ずれます。
**末尾に足すのは安全**で、それより前の回答はその日が「未回答」になるだけです。

## .claude/skills/answers/schema.json

```json
{
  "title": "回答",
  "icon": "how_to_vote",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "pollId": { "type": "string", "label": "日程調整", "required": true },
    "name": { "type": "string", "label": "名前", "required": true },
    "marks": { "type": "string", "label": "印（候補日の順に ○△×）", "required": true },
    "comment": { "type": "string", "label": "コメント" },
    "status": { "type": "enum", "label": "状態", "values": ["answered"] }
  }
}
```

**`marks` の中身はルールが確かめません。** 値の検査（`validate.keyFields`）は固定の候補の一覧と
比べるもので、「○△× を候補日の数だけ」は書けません。ページは知らない文字を「未回答」として
描くこと。

## views/poll.html — 公開の表と、自分の回答

**自分の行は `viewer.mine` で知ります。** 表には全員の行が並びますが、どれが自分のかはページ
には分かりません（行の uid は渡されない）。`viewer.mine.answers` が来ればそれを、来なければ
**`onState` の中で** `view.mine("answers", pollId)` に訊きます。押してから訊くと、続く書き込みが
クリックの扱いにならず、プレビューでは書かれません。

**自分の行があれば `correct`、無ければ `submit`。** 2 回目の `submit` はルールが拒否するので、
「直す」は必ず `correct` で。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 200;                                    /* sky - a calendar, filling in */
    --main: oklch(48% .1 var(--hue));            --fill: oklch(96% .018 var(--hue));
    --line: oklch(48% .1 var(--hue) / .16);      --ink: oklch(23% .015 var(--hue));
    --muted: oklch(53% .02 var(--hue));          --paper: oklch(99.4% .007 85);
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 52rem; padding: 28px 18px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  h2 { margin: 26px 0 6px; font-size: clamp(19px, 4vw, 24px); letter-spacing: -.02em; }
  label { display: block; margin: 12px 0; color: var(--muted); font-size: 13px; font-weight: 750; }
  input { display: block; width: min(22rem, 100%); margin-top: 6px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: inherit; }
  input:focus { border-color: var(--main); outline: 2px solid var(--line); }
  button { min-height: 38px; padding: 8px 14px; border: 0; border-radius: 10px; background: var(--main); color: var(--paper); font: inherit; font-weight: 750; cursor: pointer; touch-action: manipulation; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: center; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  tfoot td { color: var(--main); font-weight: 750; }
  td.best { background: var(--fill); }
  .pick { min-width: 44px; margin: 2px; background: var(--fill); color: var(--ink); }
  .muted { color: var(--muted); }
  #say { min-height: 1.6em; margin: 14px 0 0; color: var(--main); font-size: 13px; font-weight: 700; }
</style>
<div id="polls"></div>
<p id="say" role="status"></p>
<script>
  const view = window.__MC_APP_VIEW;
  const root = document.getElementById("polls");
  const say = document.getElementById("say");
  const MARKS = ["○", "△", "×"];
  // pollId → 自分の回答（id と送ったフィールド）。viewer.mine か view.mine の答え。
  const own = new Map();
  // pollId → 書きかけの印。描き直しても消えないように、入力とは別に持つ。
  const drafts = new Map();
  const asked = new Set();
  let latest = { polls: [], answers: [] };

  const datesOf = (poll) => String(poll.dates ?? "").split("\n").map((date) => date.trim()).filter((date) => date !== "");
  const markAt = (marks, index) => (MARKS.includes(String(marks ?? "")[index]) ? String(marks)[index] : "－");
  const isClosed = (poll) => Date.now() >= Number(poll.closesAt ?? 0);

  const draftOf = (poll) => {
    if (!drafts.has(poll.id)) {
      const mine = own.get(poll.id);
      drafts.set(poll.id, datesOf(poll).map((_, index) => (mine ? markAt(mine.marks, index) : "×")));
    }
    return drafts.get(poll.id);
  };

  const cell = (tag, text, className) => {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  const tableOf = (poll, dates) => {
    const rows = latest.answers.filter((answer) => answer.pollId === poll.id);
    const yes = dates.map((_, index) => rows.filter((row) => markAt(row.marks, index) === "○").length);
    const best = Math.max(0, ...yes);
    const head = document.createElement("tr");
    head.append(cell("th", "名前"), ...dates.map((date) => cell("th", date)), cell("th", "コメント"));
    const body = rows.map((row) => {
      const line = document.createElement("tr");
      line.append(cell("td", row.name ?? ""), ...dates.map((_, index) => cell("td", markAt(row.marks, index))), cell("td", row.comment ?? "", "muted"));
      return line;
    });
    const foot = document.createElement("tr");
    foot.append(cell("td", "○ の数"), ...yes.map((count) => cell("td", String(count), best > 0 && count === best ? "best" : "")), cell("td", ""));
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const tfoot = document.createElement("tfoot");
    thead.append(head);
    tbody.append(...body);
    tfoot.append(foot);
    table.append(thead, tbody, tfoot);
    const scroll = document.createElement("div");
    scroll.className = "scroll";
    scroll.append(table);
    return scroll;
  };

  const formOf = (poll, dates) => {
    const box = document.createElement("div");
    const draft = draftOf(poll);
    const mine = own.get(poll.id);
    const picks = document.createElement("div");
    picks.append(
      ...dates.map((date, index) => {
        const button = cell("button", `${date} ${draft[index]}`, "pick");
        button.type = "button";
        button.dataset.poll = poll.id;
        button.dataset.index = String(index);
        return button;
      }),
    );
    const name = document.createElement("label");
    name.textContent = "お名前";
    const nameInput = document.createElement("input");
    nameInput.id = `name-${poll.id}`;
    nameInput.maxLength = 40;
    nameInput.value = mine?.name ?? "";
    name.append(nameInput);
    const comment = document.createElement("label");
    comment.textContent = "コメント";
    const commentInput = document.createElement("input");
    commentInput.id = `comment-${poll.id}`;
    commentInput.maxLength = 80;
    commentInput.value = mine?.comment ?? "";
    comment.append(commentInput);
    const send = cell("button", mine ? "回答を直す" : "回答する");
    send.type = "button";
    send.dataset.send = poll.id;
    box.append(name, picks, comment, send);
    return box;
  };

  const draw = () => {
    root.replaceChildren(
      ...latest.polls.map((poll) => {
        const dates = datesOf(poll);
        const section = document.createElement("section");
        section.append(cell("h2", poll.title ?? ""));
        if (poll.note) section.append(cell("p", poll.note, "muted"));
        section.append(tableOf(poll, dates));
        section.append(isClosed(poll) ? cell("p", "締め切りました。", "muted") : formOf(poll, dates));
        return section;
      }),
    );
  };

  // 自分の行を、押される前に知っておく。押してから訊くと、続く書き込みがクリックの扱いに
  // ならず、プレビューでは書かれません。
  const askHost = async (pollId) => {
    if (asked.has(pollId) || typeof view.mine !== "function") return;
    asked.add(pollId);
    const answer = await view.mine("answers", pollId);
    if (answer?.found && answer.record) {
      own.set(pollId, answer.record);
      drafts.delete(pollId);
      draw();
    }
  };

  view.onState(({ polls = [], answers = [] }, viewer = {}) => {
    latest = { polls, answers };
    (viewer.mine?.answers ?? []).forEach((row) => own.set(row.pollId, row));
    draw();
    polls.filter((poll) => !own.has(poll.id)).forEach((poll) => askHost(poll.id));
  });

  root.addEventListener("click", async (event) => {
    const target = event.target;
    if (target.dataset?.index !== undefined) {
      const draft = drafts.get(target.dataset.poll);
      const index = Number(target.dataset.index);
      draft[index] = MARKS[(MARKS.indexOf(draft[index]) + 1) % MARKS.length];
      target.textContent = target.textContent.replace(/.$/, draft[index]);
      return;
    }
    const pollId = target.dataset?.send;
    if (!pollId) return;
    const name = document.getElementById(`name-${pollId}`).value.trim();
    if (name === "") {
      say.textContent = "お名前を入れてください。";
      return;
    }
    const values = { name, marks: drafts.get(pollId).join(""), comment: document.getElementById(`comment-${pollId}`).value.trim() };
    const mine = own.get(pollId);
    const result = mine ? await view.correct("answers", mine.id, values) : await view.submit("answers", { pollId, ...values, status: "answered" });
    if (result.ok) {
      // 新しく出した回答は、次の onState で view.mine に訊き直して自分の行にする。
      // 訊かないままだと、次に押したときに 2 回目の submit になり拒否されます。
      if (!mine) asked.delete(pollId);
      say.textContent = mine ? "回答を直しました。" : "回答しました。";
      return;
    }
    // 確認ダイアログで「やめる」を押した人には何も出しません。失敗ではないので。
    if (result.error === "cancelled") {
      say.textContent = "";
      return;
    }
    say.textContent = result.error ? `送れませんでした: ${result.error}` : "送れませんでした。";
  });
  view.ready();
</script>
```

- **締め切りの表示はページの時計、締め切りの強制はルール。** 訪問者の端末の時計がずれていても、
  締切後の書き込みはルールが拒否します
- **公開ページは動きません。** 公開申込みのあるコレクションを訪問者全員に見張らせると件数の
  2 乗で読み取りが増えるので、publish が拒否します。表はページを開いたときと、自分が送った
  後に更新されます。動く表が欲しいのは幹事で、それが下の `desk`

## views/desk.html — 幹事の画面

`audience: "member"`、入口は `/m/{slug}`。**ここは `live` で回答を見張れます** — 見張るのは
ロールを持つ人だけなので、読み取りは回答の数に比例するだけで済みます。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 200;                                    /* sky - a calendar, filling in */
    --main: oklch(48% .1 var(--hue));            --fill: oklch(96% .018 var(--hue));
    --line: oklch(48% .1 var(--hue) / .16);      --ink: oklch(23% .015 var(--hue));
    --muted: oklch(53% .02 var(--hue));          --paper: oklch(99.4% .007 85);
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 52rem; padding: 28px 18px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  h2 { margin: 22px 0 6px; font-size: 18px; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { margin: 0 0 6px; padding: 10px 13px; border: 1px solid var(--line); border-radius: 12px; background: var(--fill); }
  .muted { color: var(--muted); }
</style>
<div id="polls"></div>
<script>
  const view = window.__MC_APP_VIEW;
  const root = document.getElementById("polls");
  const MARKS = ["○", "△", "×"];
  view.onState(({ polls = [], answers = [] }) => {
    root.replaceChildren(
      ...polls.map((poll) => {
        const dates = String(poll.dates ?? "").split("\n").map((date) => date.trim()).filter((date) => date !== "");
        const rows = answers.filter((answer) => answer.pollId === poll.id);
        // 候補日ごとに ○ と △ を数え、○ の多い順に並べる。決めるのは幹事。
        const ranked = dates
          .map((date, index) => {
            const at = (mark) => rows.filter((row) => String(row.marks ?? "")[index] === mark).length;
            return { date, yes: at(MARKS[0]), maybe: at(MARKS[1]) };
          })
          .sort((a, b) => b.yes - a.yes || b.maybe - a.maybe);
        const section = document.createElement("section");
        const heading = document.createElement("h2");
        heading.textContent = `${poll.title ?? ""}（${rows.length} 人）`;
        const closes = document.createElement("p");
        closes.className = "muted";
        closes.textContent = `締切: ${new Date(Number(poll.closesAt ?? 0)).toLocaleString()}`;
        const list = document.createElement("ul");
        list.replaceChildren(
          ...ranked.map((entry) => {
            const item = document.createElement("li");
            item.textContent = `${entry.date} — ○ ${entry.yes} / △ ${entry.maybe}`;
            return item;
          }),
        );
        section.append(heading, closes, list);
        return section;
      }),
    );
  });
  view.ready();
</script>
```

---

## 日程調整を作る・締め切る — 幹事が MulmoTerminal に頼むこと

日程調整の行（`polls`）は幹事のものです。公開ページからは作れず、作るのも締め切るのも
MulmoTerminal のエージェントに頼みます。

- **作る**: `manageCollection` `putItems` で 1 行。`dates` は 1 行 1 候補、`closesAt` は締切の
  epoch millis（**number**）。締切を決めていないなら、遠い将来（例: 30 日後）を入れておく。
  `closesAt` を欠いた行は、ルールが「締切 0」として読むので**最初から閉じています**
- **締め切る**: 同じ行の `closesAt` を**今の時刻**に書き換える。新しい回答も直しも、その瞬間から
  ルールが拒否します。**ページの中からは締め切れません** — ページからの書き換え（`correct`）は
  値を文字列で送るもので、`closesAt` は number だからです
- **開き直す**: `closesAt` を未来に戻す。回答はそのまま残っています
- **決まった日を知らせる**: `note` に書けば公開ページの見出しの下に出ます

## この形が向かないもの

- **候補日ごとの定員**（「この日は 5 人まで」）。それは予約で、[class-seats.md](./class-seats.md)
- **回答を幹事だけに見せる**。`answers` を `public.read` から外せば書けますが、そうすると参加者
  同士で表を見られない — 日程調整としては別物です。アンケート（[survey.md](./survey.md)）を
- **別の端末から自分の回答を直す**（`anonymous` のまま）。上の `auth` の注を参照
