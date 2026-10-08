# テンプレート: 結果を見せるアンケート（選択式の件数と割合を公開し、名前・メール・自由記述は持ち主だけ）

**いつ使うか** — [survey.md](./survey.md) と同じアンケートで、**答えた人に「みんなはどう答えたか」を
見せたい**もの。講演の満足度、イベント後の振り返り、社内の意識調査の結果共有。

- 答える人は**メールでサインイン**（`auth: "verifiedEmail"`）、**1 人 1 件**（`idFrom: "pseudonym"`）
- 公開ページは答えを読んで、**ページの中で**設問ごと・選択肢ごとに数える
- 名前・メール・自由記述は**別のコレクション**に入り、持ち主にしか見えない

**結果を見せるかどうかは作る人が選ぶものです。** 見せないのが既定で、それは survey.md のまま。
こちらを選ぶのは、結果を見せると決めたときだけにしてください。

要点は [tally.md](./tally.md) と同じ 1 つです。**見せたいものと見せたくないものを、別々のコレクションに
分けて持つ。** ルールは「数えるだけ」と「中身を読む」を区別できません（数えられる人は行も読める）。
だから選んだ答えだけの `tallies` を `public.read` に置き、メール・名前・自由記述の `responses` は
誰にも開きません。

**数千〜1 万件程度までの形です。** 公開ページが答えを全部読んで数えるので、回答が増えるほど
1 回の表示が重くなります。それを超える規模の方針は receptron/mulmoserver#324。

---

## app.json

```json
{
  "aid": "(init が書きます。手で触らないこと)",
  "name": "講演アンケート",
  "slug": "talk-survey-results",
  "protocol": "3.0.0",
  "forkable": true,
  "shareCard": {},
  "members": {
    "owner@example.jp": { "*": "owner" }
  },
  "collections": {
    "tallies": {
      "submitOnly": true,
      "statusField": "status"
    },
    "responses": {
      "submitOnly": true,
      "statusField": "status"
    }
  },
  "views": [
    { "id": "public", "audience": "public", "path": "views/survey.html", "collections": ["questions", "tallies"] },
    { "id": "desk", "audience": "member", "path": "views/desk.html", "collections": ["questions", "tallies", "responses"], "live": ["tallies", "responses"] }
  ],
  "public": {
    "enabled": true,
    "read": ["questions", "tallies"],
    "submit": {
      "tallies": {
        "auth": "verifiedEmail",
        "idFrom": "pseudonym",
        "createFields": ["answers", "status"],
        "initialStatus": "counted",
        "validate": { "required": ["answers"] },
        "maxBytes": { "answers": 4000 }
      },
      "responses": {
        "auth": "verifiedEmail",
        "emailField": "email",
        "idFrom": "pseudonym",
        "stampField": "answeredAt",
        "createFields": ["email", "name", "comment", "answeredAt", "status"],
        "initialStatus": "submitted",
        "maxBytes": { "name": 120, "comment": 3000 }
      }
    }
  }
}
```

**`shareCard: {}`** — SNS で多くの人に見てもらうための設定です。公開ページのアドレスが `/s/...` になり、
X や LINE などにリンクを貼ったとき、このアプリの名前が画像入りのカードとして表示されます
（`"title": "..."` を書けば、その文字を大きく描きます）。1 件ずつの回答はカードになりません。
こちらから SNS に投稿することはありません。一度 SNS に表示されたカードは、あとから公開をやめても
SNS 側に残ることがあります。要らなければこの行を消してください。

**`forkable: true`** — 公開ページの下に「自分のを作る」が出て、見た人が Google のログインだけで同じ形の
アプリを自分のものとして作れます（記録は引き継がれません）。複製はスタッフ向けのページも含むので、
**それらのページも誰でも読めるようになります**。広めたくない用途なら、この行を消してください。

**`tallies` には `answers` と `status` しか置かない。** `public.read` なので、行は丸ごと全員に
見えます。メール・名前・自由記述を `tallies` に入れた瞬間、この形の約束は全部なくなります。
**`tallies` に `emailField` を付けないのも同じ理由です** — 付けると、確認済みのアドレスが
公開の行に入ります。

**`responses` は `public.read` に入れない。** それで持ち主（と、ロールを持つ人）だけが読めます。

**`idFrom: "pseudonym"`（`protocol: "3.0.0"`）** — 行の id は uid ではなく、uid とアプリ id の
ハッシュ（このアプリでの匿名 id）です。`tallies` は全員に見えるので、uid のままだと、同じ人が
別のアプリで残した名前付きの行と突き合わせられます。1 人 1 件の守りは `auth.uid` と同じです。

**同じ人の `tallies` と `responses` は同じ id を持ちます。** 持ち主の画面は id で突き合わせて
1 人分にまとめます。

**`views[].limit` を付けないこと。** 付けると、上限を超えた回答が数に入らず、件数が間違います。

## .claude/skills/questions/schema.json

```json
{
  "title": "設問",
  "icon": "quiz",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "order": { "type": "number", "label": "順番", "required": true },
    "text": { "type": "string", "label": "設問", "required": true },
    "choices": { "type": "text", "label": "選択肢（1 行 1 つ）", "required": true }
  }
}
```

設問は survey.md と同じです。選択肢は 1 行 1 つ。

## .claude/skills/tallies/schema.json

```json
{
  "title": "選んだ答え",
  "icon": "bar_chart",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "answers": { "type": "text", "label": "回答（JSON）", "required": true },
    "status": { "type": "enum", "label": "状態", "values": ["counted"] }
  }
}
```

## .claude/skills/responses/schema.json

```json
{
  "title": "回答者",
  "icon": "assignment_turned_in",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "email": { "type": "email", "label": "メール", "required": true },
    "name": { "type": "string", "label": "お名前" },
    "comment": { "type": "text", "label": "自由記述" },
    "answeredAt": { "type": "datetime", "label": "回答日時", "required": true },
    "status": { "type": "enum", "label": "状態", "values": ["submitted"] }
  }
}
```

---

## 数えているのは、誰でも書ける文字列です

`tallies.answers` は `{設問 id: 選んだ文字列}` の JSON ですが、**ルールはその中身を見ません。**
tally.md の `choice` と違って `keyFields` で固定できないのは、答えが 1 つの欄に詰まっているから
です（`keyFields` は 1 送信につき 2 欄まで、しかも欄そのものの値を見るので、JSON の中身には
届きません）。ページを開いた人がラジオの `value` を書き換えることも、ブリッジを直接呼ぶことも
できるので、**どんな文字列でも `tallies` に入ります**。

そして `tallies` は公開ページが読むものです。だから公開ページは:

- **`questions` に宣言された設問 id と、その設問の選択肢に一致する値だけを数えます。**
- **それ以外の文字列を画面に出しません。** 知らない設問 id も、知らない選択肢も、壊れた JSON も、
  出すのは「読めなかった件数」だけ。そのまま描くと、誰でも公開ページに好きな文字を出せます。

持ち主の画面（`member`）は逆で、宣言に無い値も**消さずに、宣言に無いものとして**出します。
設問は publish なしで直せるので、選択肢の文言を変えたあとの古い回答が黙って消えないように
（survey.md の desk と同じ考え方）。読むのは名簿の人なので、そこに出しても誰にも見せたことに
なりません。

**公開の数字は「いま宣言されている選択肢」だけです。** 回答が付いたあとに選択肢の文言を変えると、
それ以前の答えは公開の集計から外れます（持ち主の画面には残ります）。別物になった設問は、文言を
書き換えるのではなく新しい `id` で足してください。

---

## views/survey.html — 答える、結果を見る

**1 回押すたびに書くのは 1 本だけ。** 答えを送るのに 1 押し（`tallies`）、名前とご意見を添えて
送信を終えるのにもう 1 押し（`responses`）。1 押しに 2 本詰めると、2 本目は押下の印を失い、
MulmoTerminal のプレビューはそれを書きません。分けておくと、`responses` だけが失敗したときも
`responses` だけを送り直せば済みます。**順番は必ず `tallies` が先**です — 名前とメールが届いて
答えが届いていない人は、持ち主の画面で「答えの無い人」になってしまいます。

**結果は、答えたあとにだけ見せます。** 答える前に見せると、回答が結果に引っ張られます。答えて
いない人にも見せたいときは `drawResult` の最初の条件を外せば見えますが、そう決めるのは作る人です。

**もう答えたかは `onState` の中で訊きます**（`viewer.mine`、無ければ `view.mine`）。押してから
訊くと、続く書き込みが押下の扱いになりません。`idFrom: "pseudonym"` の id は本人の匿名 id
そのものなので、キーは何でも構いません（空文字だけはブリッジが弾くので 1 文字渡す）。
**誰も確かめられなかったときは「まだ」と扱わず**、フォームを出して拒否に答えさせます。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 250;                                    /* cornflower - answers, then the room's answer */
    --main: oklch(48% .1 var(--hue));            --fill: oklch(96.5% .02 var(--hue));
    --line: oklch(48% .1 var(--hue) / .17);      --ink: oklch(23% .018 var(--hue));
    --muted: oklch(53% .025 var(--hue));         --paper: oklch(99.3% .006 var(--hue));
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 44rem; padding: 28px 18px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  h1 { margin: 0 0 18px; font-size: clamp(23px, 5vw, 31px); line-height: 1.2; letter-spacing: -.03em; }
  h2 { margin: 26px 0 10px; font-size: 17px; letter-spacing: -.02em; }
  label { display: block; margin: 0 0 14px; color: var(--muted); font-size: 13px; font-weight: 750; }
  input:not([type="radio"]), textarea { display: block; width: min(22rem, 100%); margin-top: 6px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: inherit; }
  button { min-height: 44px; margin: 4px 6px 0 0; padding: 10px 16px; border: 0; border-radius: 12px; background: var(--main); color: var(--paper); font: inherit; font-weight: 750; cursor: pointer; touch-action: manipulation; }
  fieldset, .question { margin: 0 0 14px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--fill); }
  legend, .question > p:first-child { padding: 0 6px 0 0; font-weight: 780; }
  fieldset label { display: flex; align-items: center; gap: 9px; margin: 8px 0 0; color: var(--ink); font-size: 15px; font-weight: 400; cursor: pointer; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .bar { height: 8px; margin: 3px 0 10px; border-radius: 4px; background: var(--main); }
  .muted { color: var(--muted); }
  #say { min-height: 1.6em; margin: 10px 0 0; color: var(--main); font-size: 13px; font-weight: 700; }
</style>
<h1>講演アンケート</h1>
<p id="checking" class="muted">確認しています…</p>
<div id="ask" hidden>
  <div id="list"></div>
  <button id="send" type="button">答えを送る</button>
</div>
<div id="finish" hidden>
  <p>答えを受け付けました。最後に、持ち主にだけ届く欄です（空のままでも送れます）。</p>
  <label>お名前 <input id="who" maxlength="40" /></label>
  <label>ご意見 <textarea id="comment" maxlength="1000"></textarea></label>
  <button id="send-response" type="button">送信を終える</button>
</div>
<p id="say" role="status"></p>
<div id="result" hidden>
  <h2>みんなの答え</h2>
  <p id="total" class="muted"></p>
  <div id="bars"></div>
</div>
<script>
  const view = window.__MC_APP_VIEW;
  const say = document.getElementById("say");
  // 「答えたか」「送信を終えたか」は 3 状態: true / false / null（まだ分からない）。
  const mine = { tallied: null, responded: null };
  let questions = [];
  let tallies = [];

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const choicesOf = (question) =>
    String(question.choices ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");

  const answersOf = (row) => {
    try {
      const parsed = JSON.parse(String(row.answers ?? ""));
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  /** 設問ごと・選択肢ごとの件数。数えるのは宣言された設問 id と、その選択肢に一致する値だけ。
   *  tallies は誰でも書けるので、それ以外の文字列はここで捨て、画面には件数しか出さない。 */
  const countAnswers = (rows) => {
    const counts = new Map(questions.map((question) => [question.id, new Map(choicesOf(question).map((choice) => [choice, 0]))]));
    let unreadable = 0;
    rows.forEach((row) => {
      const answered = answersOf(row);
      if (answered === null) {
        unreadable += 1;
        return;
      }
      counts.forEach((perChoice, questionId) => {
        const choice = Object.hasOwn(answered, questionId) ? answered[questionId] : undefined;
        if (typeof choice === "string" && perChoice.has(choice)) perChoice.set(choice, perChoice.get(choice) + 1);
      });
    });
    return { counts, unreadable };
  };

  const drawForm = () => {
    // textContent で組み立てること。設問も選択肢も人が入力するもので、innerHTML に入れると
    // 公開ページでそれが動きます。ボタンではなくラジオで選ばせる理由は survey.md の
    // 「ページは 2 枚書きます」。
    document.getElementById("list").replaceChildren(
      ...questions.map((question) => {
        const box = element("fieldset");
        box.append(element("legend", "", question.text ?? question.id));
        choicesOf(question).forEach((choice) => {
          const line = element("label");
          const radio = element("input");
          radio.type = "radio";
          radio.name = `q-${question.id}`;
          radio.value = choice;
          radio.dataset.question = question.id;
          line.append(radio, element("span", "", choice));
          box.append(line);
        });
        return box;
      }),
    );
  };

  const drawResult = () => {
    const result = document.getElementById("result");
    // 答える前に結果を見せると、回答が結果に引っ張られます。
    result.hidden = mine.tallied !== true;
    if (result.hidden) return;
    const { counts, unreadable } = countAnswers(tallies);
    const total = [`${tallies.length} 件の回答`];
    if (unreadable > 0) total.push(`（うち ${unreadable} 件は読めない形式のため数えていません）`);
    document.getElementById("total").textContent = total.join("");
    document.getElementById("bars").replaceChildren(
      ...questions.map((question) => {
        const perChoice = counts.get(question.id);
        const answered = [...perChoice.values()].reduce((sum, count) => sum + count, 0);
        const box = element("div", "question");
        box.append(element("p", "", question.text ?? question.id));
        perChoice.forEach((count, choice) => {
          const share = answered === 0 ? 0 : Math.round((count / answered) * 100);
          const row = element("div", "row");
          row.append(element("span", "", choice), element("span", "", `${count}（${share}%）`));
          const bar = element("div", "bar");
          bar.style.width = `${Math.max(1, share)}%`;
          box.append(row, bar);
        });
        return box;
      }),
    );
  };

  const draw = () => {
    document.getElementById("checking").hidden = mine.tallied !== null;
    document.getElementById("ask").hidden = mine.tallied !== false;
    document.getElementById("finish").hidden = !(mine.tallied === true && mine.responded === false);
    drawResult();
  };

  // 押される前に、もう答えたかを知っておく。押してから訊くと、続く書き込みが押下の扱いにならない。
  const askHost = async (cid, key) => {
    let answer = null;
    try {
      answer = typeof view.mine === "function" ? await view.mine(cid, "me") : null;
    } catch {
      answer = null;
    }
    // 誰も確かめられなかった（known: false）ときもフォームを出します。ページは「まだ答えて
    // いません」とは言わないので、答えた人が押しても拒否がそのまま答えになります。
    mine[key] = answer?.known ? Boolean(answer.found) : false;
    draw();
  };

  view.onState(({ questions: rows = [], tallies: counted = [] }, viewer = {}) => {
    questions = rows.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    tallies = counted;
    if (Array.isArray(viewer.mine?.tallies)) mine.tallied = viewer.mine.tallies.length > 0;
    if (Array.isArray(viewer.mine?.responses)) mine.responded = viewer.mine.responses.length > 0;
    drawForm();
    draw();
    if (mine.tallied === null) askHost("tallies", "tallied");
    if (mine.responded === null) askHost("responses", "responded");
  });

  // 送信中にもう一度押されたら何もしない。2 本目は 1 本目が通ったあとに拒否され、
  // 「受け付けました」をエラーで上書きします。
  let sending = false;
  const submitOnce = async (cid, values) => {
    if (sending) return null;
    sending = true;
    try {
      return await view.submit(cid, values);
    } finally {
      sending = false;
    }
  };

  const report = (result, done) => {
    if (result.ok) {
      say.textContent = done;
      return true;
    }
    // 確認ダイアログで「やめる」を押した人には何も出しません。失敗ではないので。
    say.textContent = result.error === "cancelled" ? "" : `送れませんでした: ${result.error ?? ""}`;
    return false;
  };

  // セレクタに id を差し込まず、属性で突き合わせます。設問 id は人が付けるものです。
  const answerOf = (question) =>
    [...document.querySelectorAll("#list input[type=radio]")].find((radio) => radio.dataset.question === question.id && radio.checked)?.value ?? "";

  document.getElementById("send").addEventListener("click", async () => {
    if (mine.tallied === true) return;
    // 設問が 1 つも無いまま送ると "{}" が通り、その人の 1 件はあとで設問を足しても埋まりません。
    if (questions.length === 0) {
      say.textContent = "設問がまだありません。";
      return;
    }
    const missing = questions.filter((question) => answerOf(question) === "");
    if (missing.length > 0) {
      say.textContent = `${missing.length} 問、まだ選んでいません。`;
      return;
    }
    // 送るのは選んだ答えだけ。tallies は全員に見えるので、名前もご意見もここには入れません。
    // status は親が入れるので送りません。
    const answers = JSON.stringify(Object.fromEntries(questions.map((question) => [question.id, answerOf(question)])));
    const result = await submitOnce("tallies", { answers });
    if (result && report(result, "答えを受け付けました。")) {
      mine.tallied = true;
      tallies = [...tallies, { answers }];
      draw();
    }
  });

  document.getElementById("send-response").addEventListener("click", async () => {
    // email と answeredAt は親が入れるので送りません。失敗しても答えは数に入っているので、
    // ここだけをもう一度押せば済みます。
    const values = { name: document.getElementById("who").value.trim(), comment: document.getElementById("comment").value.trim() };
    const result = await submitOnce("responses", values);
    if (result && report(result, "ありがとうございました。")) {
      mine.responded = true;
      draw();
    }
  });

  view.ready();
</script>
```

- **自分の答えは、送った直後にだけ手元で足して描きます。** 他の人の答えは、ページを開き直すと
  反映されます（公開ページは動きません。公開申込みのあるコレクションを訪問者全員に見張らせると
  読み取りが件数の 2 乗で増えるので、publish が拒否します）
- **割合は設問ごとの分母です。** その設問に数えられる答えをした人の数で割るので、選択肢の割合を
  足すと（四捨五入の誤差を除いて）100% になります

## views/desk.html — 持ち主の画面

`audience: "member"`、入口は `/m/{slug}`。survey.md の desk と同じ集計（**宣言と保存の和**）に
加えて、`tallies` と `responses` を **id で突き合わせて** 1 人分ずつ並べます。`live` で見張って
いるので、届いたそばから増えます。

答えはあるのに名前・メールが無い人は、2 押し目の前にページを閉じた人です。その人も数には
入っています。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 250;                                    /* cornflower - answers, then the room's answer */
    --main: oklch(48% .1 var(--hue));            --fill: oklch(96.5% .02 var(--hue));
    --line: oklch(48% .1 var(--hue) / .17);      --ink: oklch(23% .018 var(--hue));
    --muted: oklch(53% .025 var(--hue));         --paper: oklch(99.3% .006 var(--hue));
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 48rem; padding: 24px 16px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  h2 { margin: 26px 0 10px; font-size: 17px; letter-spacing: -.02em; }
  ul { margin: 0; padding: 0; list-style: none; }
  li, .question { margin: 0 0 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--fill); }
  .question > p:first-child { margin-top: 0; font-weight: 780; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .bar { height: 8px; margin: 3px 0 10px; border-radius: 4px; background: var(--main); }
  .muted { color: var(--muted); }
</style>
<p id="summary" class="muted"></p>
<div id="tally"></div>
<h2>回答者</h2>
<ul id="people"></ul>
<script>
  const view = window.__MC_APP_VIEW;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const choicesOf = (question) =>
    String(question.choices ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  const answersOf = (row) => {
    try {
      const parsed = JSON.parse(String(row?.answers ?? ""));
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  /** 保存されている答えを、設問 id → 選択肢 → 件数 に。宣言に無い値もここでは捨てない。 */
  const countStored = (tallies) => {
    const chosen = new Map();
    tallies.forEach((row) => {
      Object.entries(answersOf(row) ?? {}).forEach(([questionId, choice]) => {
        if (typeof choice !== "string" || choice === "") return;
        const perChoice = chosen.get(questionId) ?? new Map();
        perChoice.set(choice, (perChoice.get(choice) ?? 0) + 1);
        chosen.set(questionId, perChoice);
      });
    });
    return chosen;
  };

  const drawTally = (questions, tallies) => {
    const chosen = countStored(tallies);
    const declared = new Set(questions.map((question) => question.id));
    const shown = questions.concat(
      [...chosen.keys()].filter((id) => !declared.has(id)).map((id) => ({ id, text: `${id}（宣言にない設問 ID）`, choices: "" })),
    );
    document.getElementById("tally").replaceChildren(
      ...shown.map((question) => {
        const perChoice = chosen.get(question.id) ?? new Map();
        const known = choicesOf(question);
        const unknown = [...perChoice.keys()].filter((choice) => !known.includes(choice));
        const box = element("div", "question");
        box.append(element("p", "", question.text ?? question.id));
        [...known, ...unknown].forEach((choice) => {
          const count = perChoice.get(choice) ?? 0;
          const share = tallies.length === 0 ? 0 : Math.round((count / tallies.length) * 100);
          const row = element("div", "row");
          // 宣言に無い値は、消された選択肢の名残とも、回答者が作った文字列とも区別がつきません。
          row.append(element("span", "", unknown.includes(choice) ? `${choice}（宣言にない値）` : choice), element("span", "", `${count}（${share}%）`));
          const bar = element("div", "bar");
          bar.style.width = `${Math.max(1, share)}%`;
          box.append(row, bar);
        });
        return box;
      }),
    );
  };

  const drawPeople = (questions, tallies, responses) => {
    const tallyOf = new Map(tallies.map((row) => [row.id, row]));
    const responseOf = new Map(responses.map((row) => [row.id, row]));
    const ids = [...new Set([...tallyOf.keys(), ...responseOf.keys()])];
    const textOf = new Map(questions.map((question) => [question.id, question.text ?? question.id]));
    // answeredAt はサーバが入れた "…Z" の文字列。辞書順が時刻順なので、そのまま比較します。
    ids.sort((a, b) => String(responseOf.get(b)?.answeredAt ?? "").localeCompare(String(responseOf.get(a)?.answeredAt ?? "")));
    document.getElementById("people").replaceChildren(
      ...ids.map((id) => {
        const response = responseOf.get(id);
        const answered = answersOf(tallyOf.get(id));
        const item = element("li");
        item.append(element("p", "", response ? `${response.name || "（名前なし）"}（${response.email ?? ""}）` : "（名前・メールなし）"));
        if (answered === null) item.append(element("p", "muted", tallyOf.has(id) ? "答え: 読めない形式" : "答え: なし"));
        Object.entries(answered ?? {}).forEach(([questionId, choice]) => item.append(element("p", "muted", `${textOf.get(questionId) ?? questionId}: ${String(choice)}`)));
        if (response?.comment) item.append(element("p", "", response.comment));
        return item;
      }),
    );
  };

  view.onState(({ questions = [], tallies = [], responses = [] }) => {
    const ordered = questions.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    document.getElementById("summary").textContent = `${tallies.length} 件の回答 / 名前・メール ${responses.length} 件`;
    drawTally(ordered, tallies);
    drawPeople(ordered, tallies, responses);
  });
  view.ready();
</script>
```

## この形が向かないもの

- **結果を見せないアンケート**。それが既定で、[survey.md](./survey.md)
- **数万件を超える回答**。公開ページが答えを全部読むので重くなります。方針は
  receptron/mulmoserver#324（定期的に集計した 1 文書を読む形へ）
- **選択肢が 1 つだけの投票で、サインインさせたくないもの**。それは [tally.md](./tally.md) —
  `keyFields` で選択肢そのものをルールに固定でき、匿名で答えられます
- **自由記述を公開したい**。それは `public.readPublished` で持ち主が選んだものだけ、
  [question-box.md](./question-box.md)
- **答えが動いているところを見せたい**（講演中の投票など）。それは [live-poll.md](./live-poll.md)
