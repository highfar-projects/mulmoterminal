# テンプレート: 集計だけ見せる（選んだ答えの件数だけを公開し、名前やコメントは持ち主だけが読む）

**いつ使うか** — 訪問者に「みんなはどう答えたか」の**件数と割合だけ**を見せ、誰が何と書いたかは
見せないもの。「どれが好き？」の結果発表、診断の分布、イベントの希望調査。

- 答える人は**サインイン画面なし**（`auth: "anonymous"`）、**1 人 1 票**（`idFrom: "auth.uid"`）
- 公開ページは票を読んで、**ページの中で**選択肢ごとに数える
- 名前やコメントは**別のコレクション**に入り、持ち主にしか見えない

要点は 1 つです。**見せたいものと見せたくないものを、別々のコレクションに分けて持つ。** ルールは
「数えるだけ」と「中身を読む」を区別できません（数えられる人は行も読める）。だから、数えさせて
よい欄だけの `votes` を `public.read` に置き、名前とコメントの `notes` は誰にも開きません。

**数千〜1 万件程度までの形です。** 公開ページが票を全部読んで数えるので、票が増えるほど
1 回の表示が重くなります。それを超える規模の方針は receptron/mulmoserver#324。

---

## app.json

```json
{
  "aid": "(init が書きます。手で触らないこと)",
  "name": "どれが好き？",
  "slug": "tally",
  "protocol": "1.0.0",
  "members": {
    "owner@example.jp": { "*": "owner" }
  },
  "collections": {
    "votes": {
      "submitOnly": true,
      "statusField": "status",
      "aggregate": { "by": ["choice"] }
    },
    "notes": {
      "submitOnly": true,
      "statusField": "status"
    }
  },
  "views": [
    { "id": "public", "audience": "public", "path": "views/vote.html", "collections": ["votes"] },
    { "id": "desk", "audience": "member", "path": "views/desk.html", "collections": ["votes", "notes"], "live": ["votes", "notes"] }
  ],
  "public": {
    "enabled": true,
    "read": ["votes"],
    "submit": {
      "votes": {
        "auth": "anonymous",
        "idFrom": "auth.uid",
        "createFields": ["choice", "status"],
        "initialStatus": "voted",
        "validate": {
          "required": ["choice"],
          "keyFields": [{ "field": "choice", "values": ["red", "blue", "green", "yellow"] }]
        }
      },
      "notes": {
        "auth": "anonymous",
        "idFrom": "auth.uid",
        "createFields": ["name", "comment", "status"],
        "initialStatus": "sent",
        "maxBytes": { "name": 120, "comment": 1200 }
      }
    }
  }
}
```

**`votes` には `choice` と `status` しか置かない。** `public.read` なので、行は丸ごと全員に
見えます。名前やコメントを `votes` に入れた瞬間、この形の約束は全部なくなります。

**`notes` は `public.read` に入れない。** それで持ち主（と、ロールを持つ人）だけが読めます。

**同じ人の票とメモは同じ id（uid）を持ちます。** 持ち主の画面は id で突き合わせて 1 人分に
まとめます。

**`validate.keyFields` が選択肢を固定します。** 一覧に無い値はルールが拒否するので、件数が
知らない選択肢に割れることはありません。**1 つの送信につき 2 欄まで**です（ルールが展開して
いる上限。3 つ目は受理されても検査されません）。選択肢を変えるときは、ページの `CHOICES` も
同じに直すこと。

**`aggregate.by`** は今は誰も読まない宣言ですが、大規模化（#324）のときに「何で集計するか」を
表す場所です。publish は、ここに挙げた欄が `keyFields` で検査されていることを確かめます。

**`auth: "anonymous"`** — **Firebase コンソールで Anonymous プロバイダを有効にする**必要が
あります（プロジェクトごとに 1 回）。代償は、1 票がブラウザ単位であること。

**`views[].limit` を付けないこと。** 付けると、上限を超えた票が数に入らず、件数が間違います。

## .claude/skills/votes/schema.json

```json
{
  "title": "票",
  "icon": "how_to_vote",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "choice": { "type": "enum", "label": "選んだもの", "values": ["red", "blue", "green", "yellow"], "required": true },
    "status": { "type": "enum", "label": "状態", "values": ["voted"] }
  }
}
```

## .claude/skills/notes/schema.json

```json
{
  "title": "メモ",
  "icon": "sticky_note_2",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "name": { "type": "string", "label": "名前" },
    "comment": { "type": "string", "label": "コメント" },
    "status": { "type": "enum", "label": "状態", "values": ["sent"] }
  }
}
```

## views/vote.html — 選ぶ、結果を見る

**1 回押すたびに書くのは 1 本だけ。** 票を送るのに 1 押し、名前とコメントを添えるのにもう 1 押し。
1 押しに 2 本詰めると、2 本目は押下の印を失い、MulmoTerminal のプレビューはそれを書きません。
分けておくと、メモだけが失敗したときも、メモだけを送り直せば済みます。

**もう投票したかは `onState` の中で訊きます**（`view.mine`）。押してから訊くと、続く書き込みが
押下の扱いになりません。`idFrom: "auth.uid"` の id は uid そのものなので、キーは何でも構いません
（空文字だけはブリッジが弾くので 1 文字渡す）。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 305;                                    /* orchid - a crowd making up its mind */
    --main: oklch(50% .12 var(--hue));           --fill: oklch(96.5% .022 var(--hue));
    --line: oklch(50% .12 var(--hue) / .18);     --ink: oklch(24% .02 var(--hue));
    --muted: oklch(52% .03 var(--hue));          --paper: oklch(99.3% .007 var(--hue));
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 38rem; padding: 28px 18px 56px; font: 15px/1.7 system-ui, "Hiragino Sans", sans-serif; }
  h1 { margin: 0 0 4px; font-size: clamp(22px, 5vw, 28px); letter-spacing: -.02em; }
  button { min-height: 44px; padding: 10px 16px; border: 0; border-radius: 12px; background: var(--main); color: var(--paper); font: inherit; font-weight: 750; cursor: pointer; touch-action: manipulation; }
  .choice { display: block; width: 100%; margin: 0 0 8px; background: var(--fill); color: var(--ink); text-align: left; }
  input, textarea { display: block; width: 100%; margin: 6px 0 10px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: inherit; }
  .bar { height: 10px; margin: 4px 0 12px; border-radius: 5px; background: var(--main); }
  .row { display: flex; justify-content: space-between; font-weight: 700; }
  .muted { color: var(--muted); }
  #say { min-height: 1.6em; margin: 10px 0 0; color: var(--main); font-size: 13px; font-weight: 700; }
</style>
<h1>どれが好き？</h1>
<div id="vote">
  <div id="pick"></div>
  <div id="note"></div>
</div>
<p id="say" role="status"></p>
<h2>みんなの答え</h2>
<div id="result"></div>
<script>
  const view = window.__MC_APP_VIEW;
  // keyFields の values と同じ順・同じ値にすること。ここに無い値は数えません。
  const CHOICES = [
    { value: "red", label: "赤" },
    { value: "blue", label: "青" },
    { value: "green", label: "緑" },
    { value: "yellow", label: "黄" },
  ];
  const say = document.getElementById("say");
  // 「投票済みか」「メモを送ったか」は 3 状態: true / false / null（まだ分からない）。
  const mine = { voted: null, noted: null };
  let votes = [];

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /** 選択肢ごとの件数と割合。一覧に無い値は捨てる — 数がその選択肢に割れないように。 */
  const tally = (rows) => {
    const counts = new Map(CHOICES.map((entry) => [entry.value, 0]));
    rows.forEach((row) => {
      if (counts.has(row.choice)) counts.set(row.choice, counts.get(row.choice) + 1);
    });
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    return CHOICES.map((entry) => ({ ...entry, count: counts.get(entry.value), share: total === 0 ? 0 : counts.get(entry.value) / total }));
  };

  const drawResult = () => {
    const rows = tally(votes);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    document.getElementById("result").replaceChildren(
      element("p", "muted", `${total} 票`),
      ...rows.flatMap((row) => {
        const line = element("div", "row");
        line.append(element("span", "", row.label), element("span", "", `${row.count}（${Math.round(row.share * 100)}%）`));
        const bar = element("div", "bar");
        bar.style.width = `${Math.max(2, Math.round(row.share * 100))}%`;
        return [line, bar];
      }),
    );
  };

  const drawPick = () => {
    const pick = document.getElementById("pick");
    if (mine.voted === null) return pick.replaceChildren(element("p", "muted", "確認しています…"));
    if (mine.voted) return pick.replaceChildren(element("p", "muted", "投票ありがとうございました。"));
    pick.replaceChildren(
      ...CHOICES.map((entry) => {
        const button = element("button", "choice", entry.label);
        button.type = "button";
        button.dataset.choice = entry.value;
        return button;
      }),
    );
  };

  const drawNote = () => {
    const note = document.getElementById("note");
    if (!mine.voted || mine.noted !== false) return note.replaceChildren();
    const name = element("input");
    name.id = "name";
    name.maxLength = 40;
    name.placeholder = "名前（なくても構いません）";
    const comment = element("textarea");
    comment.id = "comment";
    comment.maxLength = 400;
    comment.placeholder = "ひとこと（持ち主だけが読みます）";
    const send = element("button", "", "名前・コメントも送る");
    send.type = "button";
    send.id = "send-note";
    note.replaceChildren(name, comment, send);
  };

  const draw = () => {
    drawPick();
    drawNote();
    drawResult();
  };

  // 押される前に、もう答えたかを知っておく。押してから訊くと、続く書き込みが押下の扱いにならない。
  const askHost = async (cid, key) => {
    if (typeof view.mine !== "function") return;
    const answer = await view.mine(cid, "me");
    if (answer?.known) {
      mine[key] = Boolean(answer.found);
      draw();
    }
  };

  view.onState(({ votes: rows = [] }, viewer = {}) => {
    votes = rows;
    if (Array.isArray(viewer.mine?.votes)) mine.voted = viewer.mine.votes.length > 0;
    if (Array.isArray(viewer.mine?.notes)) mine.noted = viewer.mine.notes.length > 0;
    draw();
    if (mine.voted === null) askHost("votes", "voted");
    if (mine.noted === null) askHost("notes", "noted");
  });

  const report = (result, done) => {
    if (result.ok) {
      say.textContent = done;
      return true;
    }
    // 確認ダイアログで「やめる」を押した人には何も出しません。失敗ではないので。
    say.textContent = result.error === "cancelled" ? "" : `送れませんでした: ${result.error ?? ""}`;
    return false;
  };

  document.getElementById("vote").addEventListener("click", async (event) => {
    const target = event.target;
    if (target.dataset?.choice && mine.voted === false) {
      // status は親が入れるので送りません。
      if (report(await view.submit("votes", { choice: target.dataset.choice }), "投票しました。")) {
        mine.voted = true;
        votes = [...votes, { choice: target.dataset.choice }];
        draw();
      }
      return;
    }
    if (target.id === "send-note") {
      const values = { name: document.getElementById("name").value.trim(), comment: document.getElementById("comment").value.trim() };
      if (values.name === "" && values.comment === "") {
        say.textContent = "名前かコメントを書いてください。";
        return;
      }
      if (report(await view.submit("notes", values), "届きました。")) {
        mine.noted = true;
        draw();
      }
    }
  });
  view.ready();
</script>
```

- **自分の票は、送った直後にだけ手元で足して描きます。** 他の人の票は、ページを開き直すと
  反映されます（公開ページは動きません。公開申込みのあるコレクションを訪問者全員に見張らせると
  読み取りが件数の 2 乗で増えるので、publish が拒否します）
- **メモだけが失敗しても、票は数に入っています。** メモの欄は残るので、もう一度押せば送れます

## views/desk.html — 持ち主の画面

`audience: "member"`、入口は `/m/{slug}`。票とメモを **id で突き合わせて** 1 人分ずつ並べ、
`live` で見張っているので届いたそばから増えます。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 305;                                    /* orchid - a crowd making up its mind */
    --main: oklch(50% .12 var(--hue));           --fill: oklch(96.5% .022 var(--hue));
    --line: oklch(50% .12 var(--hue) / .18);     --ink: oklch(24% .02 var(--hue));
    --muted: oklch(52% .03 var(--hue));          --paper: oklch(99.3% .007 var(--hue));
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 44rem; padding: 24px 16px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { margin: 0 0 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--fill); }
  .choice { font-weight: 750; }
  .muted { color: var(--muted); }
</style>
<p id="summary" class="muted"></p>
<ul id="people"></ul>
<script>
  const view = window.__MC_APP_VIEW;
  const LABELS = { red: "赤", blue: "青", green: "緑", yellow: "黄" };
  const line = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  view.onState(({ votes = [], notes = [] }) => {
    const noteOf = new Map(notes.map((note) => [note.id, note]));
    document.getElementById("summary").textContent = `${votes.length} 票 / メモ ${notes.length} 件`;
    document.getElementById("people").replaceChildren(
      ...votes.map((vote) => {
        const note = noteOf.get(vote.id);
        const item = document.createElement("li");
        item.append(line("p", "choice", LABELS[vote.choice] ?? String(vote.choice ?? "")));
        if (note?.name) item.append(line("p", "", note.name));
        if (note?.comment) item.append(line("p", "muted", note.comment));
        return item;
      }),
    );
  });
  view.ready();
</script>
```

## この形が向かないもの

- **数万件を超える投票**。公開ページが票を全部読むので重くなります。方針は
  receptron/mulmoserver#324（定期的に集計した 1 文書を読む形へ）
- **答えの中身も見せたい**。それは `public.read` で、[schedule-poll.md](./schedule-poll.md)
- **選んだ答えだけを見せたい**。それは `public.readPublished`、[question-box.md](./question-box.md)
- **自由記述を集計したい**。数えられるのは `keyFields` で固定した選択肢だけです
