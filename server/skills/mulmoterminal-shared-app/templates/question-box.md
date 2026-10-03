# テンプレート: 質問箱（誰でも質問でき、持ち主が選んだものだけを公開する）

**いつ使うか** — 誰でも名乗らずに質問を送れて、持ち主が答え、**選んだ質問と答えだけ**を公開
ページに載せるもの。講演や配信への質問、お店やサークルへの「よくある質問」、マシュマロや
質問箱のような遊び。

- 質問する人は**サインイン画面なし**（`auth: "anonymous"`）。何件でも送れる（`idFrom: "auto"`）
- 届いた質問は**持ち主にしか見えない**。公開ページに出るのは、持ち主が出すと決めた行だけ
  （`public.readPublished` + `publishField`）
- 出す・引っ込めるのは**持ち主の操作だけ**。質問した本人も、その印は書けません

要点は 1 つです。**「出すかどうか」はページではなくルールが決めます。** 公開ページは
`published` が `true` の行しか受け取らず、それ以外の一覧を訪問者が求めるとルールが拒否します。
ページが「非表示の行を描かない」ように気を付ける、という話ではありません — 届かないのです。

---

## app.json

```json
{
  "aid": "(init が書きます。手で触らないこと)",
  "name": "質問箱",
  "slug": "question-box",
  "protocol": "1.0.0",
  "forkable": true,
  "members": {
    "owner@example.jp": { "*": "owner" }
  },
  "collections": {
    "questions": {
      "submitOnly": true,
      "statusField": "status",
      "transitions": { "initial": ["asked"], "asked": ["answered"] },
      "publishField": "published"
    }
  },
  "views": [
    { "id": "public", "audience": "public", "path": "views/box.html", "collections": ["questions"] },
    { "id": "desk", "audience": "member", "path": "views/desk.html", "collections": ["questions"], "live": ["questions"] }
  ],
  "public": {
    "enabled": true,
    "readPublished": ["questions"],
    "submit": {
      "questions": {
        "auth": "anonymous",
        "idFrom": "auto",
        "createFields": ["text", "askedAt", "status"],
        "stampField": "askedAt",
        "initialStatus": "asked",
        "validate": { "required": ["text"] },
        "maxBytes": { "text": 2000, "answer": 6000 }
      }
    }
  }
}
```

**`forkable: true`** — 公開ページの下に「自分のを作る」が出て、見た人が Google のログインだけで同じ形の
アプリを自分のものとして作れます（記録は引き継がれません）。複製はスタッフ向けのページも含むので、
**それらのページも誰でも読めるようになります**。広めたくない用途なら、この行を消してください。

**`public.readPublished` であって `public.read` ではない。** `read` に入れると届いた質問が全部、
送られた瞬間から全員に見えます。両方に入れることは publish が拒否します。

**`publishField: "published"` を `createFields` に入れないこと。** 入れると質問する人が自分で
「公開」の印を付けて送れる — と思えますが、publish が拒否し、仮に通ってもルールが拒否します。
印は**持ち主が後から**付けるものです。

**`auth: "anonymous"`** — **Firebase コンソールで Anonymous プロバイダを有効にする**必要があり、
これはリポジトリからはできません（プロジェクトごとに 1 回）。無効のままだと、質問する人に
Google のサインインを求める画面が出ます。

**`emailField` を置かないこと。** 匿名のセッションは住所を持たないので publish が拒否します。
それに、公開した行は丸ごと全員に見えます。

**`idFrom: "auto"`** — 1 人が何件でも送れます。1 人 1 件にしたいなら `"auth.uid"` ですが、
質問箱では 2 つ目の質問が拒否されるのは不自然です。

**`maxBytes`** — 長文の貼り付けを止めます。UTF-8 のバイト数なので、日本語は 1 文字 3 バイト
前後（2000 なら 600〜700 字）。`answer` は質問する人が書かない欄ですが、ここに書いた上限は
持ち主の `view.correct` にも効きます。答えも公開ページに丸ごと出るので、上限を置いておく。

## .claude/skills/questions/schema.json

```json
{
  "title": "質問",
  "icon": "help",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "text": { "type": "string", "label": "質問", "required": true },
    "answer": { "type": "string", "label": "答え" },
    "status": { "type": "enum", "label": "状態", "values": ["asked", "answered"] },
    "askedAt": { "type": "datetime", "label": "届いた日時", "required": true },
    "published": { "type": "boolean", "label": "公開" }
  }
}
```

**`published` は boolean。** ルールは `== true` で比べるので、文字列の `"true"` は公開になりません。
ページの `view.correct` は値を文字列で送るものなので、**公開の切り替えはページからはしません**
（下の「出す・引っ込める」）。

## views/box.html — 質問を送る、公開された答えを読む

**届くのは公開した行だけ**です。自分が送った質問も、持ち主が出すまでは見えません。だから
送った直後に「届きました。答えが公開されたらここに出ます」と言う — 何も出ないと、送れて
いないように見えます。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 45;                                     /* amber - a question in the air */
    --main: oklch(50% .11 var(--hue));           --fill: oklch(96.5% .025 var(--hue));
    --line: oklch(50% .11 var(--hue) / .18);     --ink: oklch(24% .02 var(--hue));
    --muted: oklch(52% .03 var(--hue));          --paper: oklch(99.3% .008 var(--hue));
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 40rem; padding: 28px 18px 56px; font: 15px/1.7 system-ui, "Hiragino Sans", sans-serif; }
  h1 { margin: 0 0 4px; font-size: clamp(22px, 5vw, 28px); letter-spacing: -.02em; }
  textarea { display: block; width: 100%; min-height: 6.5em; margin: 14px 0 10px; padding: 11px 13px; border: 1px solid var(--line); border-radius: 12px; background: #fff; color: var(--ink); font: inherit; resize: vertical; }
  textarea:focus { border-color: var(--main); outline: 2px solid var(--line); }
  button { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 12px; background: var(--main); color: var(--paper); font: inherit; font-weight: 750; cursor: pointer; touch-action: manipulation; }
  button:disabled { opacity: .55; }
  #say { min-height: 1.6em; margin: 10px 0 0; color: var(--main); font-size: 13px; font-weight: 700; }
  ol { margin: 30px 0 0; padding: 0; list-style: none; }
  li { margin: 0 0 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--fill); }
  .q { margin: 0; font-weight: 750; white-space: pre-wrap; }
  .a { margin: 8px 0 0; white-space: pre-wrap; }
  .muted { color: var(--muted); }
</style>
<h1>質問箱</h1>
<p class="muted">名前は要りません。選んだ質問を、ここに載せていきます。</p>
<textarea id="text" maxlength="600" placeholder="質問をどうぞ"></textarea>
<button id="send" type="button">送る</button>
<p id="say" role="status"></p>
<ol id="answered"></ol>
<script>
  const view = window.__MC_APP_VIEW;
  const list = document.getElementById("answered");
  const text = document.getElementById("text");
  const send = document.getElementById("send");
  const say = document.getElementById("say");

  const line = (className, value) => {
    const element = document.createElement("p");
    element.className = className;
    element.textContent = value;
    return element;
  };

  view.onState(({ questions = [] }) => {
    // askedAt はサーバが入れた "…Z" の文字列。辞書順が時刻順なので、そのまま新しい順に。
    const shown = [...questions].sort((a, b) => String(b.askedAt ?? "").localeCompare(String(a.askedAt ?? "")));
    if (shown.length === 0) {
      list.replaceChildren(line("muted", "まだ載っている質問はありません。"));
      return;
    }
    list.replaceChildren(
      ...shown.map((question) => {
        const item = document.createElement("li");
        item.append(line("q", question.text ?? ""));
        item.append(question.answer ? line("a", question.answer) : line("a muted", "（答えを準備中です）"));
        return item;
      }),
    );
  });

  send.addEventListener("click", async () => {
    const value = text.value.trim();
    if (value === "") {
      say.textContent = "質問を書いてください。";
      return;
    }
    send.disabled = true;
    // status と askedAt は親が入れるので送りません。
    const result = await view.submit("questions", { text: value });
    send.disabled = false;
    if (result.ok) {
      text.value = "";
      say.textContent = "届きました。公開されたら、ここに載ります。";
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

- **公開ページは動きません。** 公開申込みのあるコレクションを訪問者全員に見張らせると件数の
  2 乗で読み取りが増えるので、publish が拒否します。新しく公開した答えは、ページを開き直すと
  出ます
- **公開していない行は、プレビューにも出ません。** プレビューは本番と同じく、公開した行だけを
  このページに渡します

## views/desk.html — 持ち主が答える画面

`audience: "member"`、入口は `/m/{slug}`。届いた質問が**全部**、新しい順に並び、`live` で
見張っているので届いたそばから増えます。答えを書いて保存すると、`answer` が書かれ、状態が
`answered` に進みます。

```html
<style>
  /* Every colour is derived from ONE hue — the rules are in design.md. Change it for your app. */
  :root {
    --hue: 45;                                     /* amber - a question in the air */
    --main: oklch(50% .11 var(--hue));           --fill: oklch(96.5% .025 var(--hue));
    --line: oklch(50% .11 var(--hue) / .18);     --ink: oklch(24% .02 var(--hue));
    --muted: oklch(52% .03 var(--hue));          --paper: oklch(99.3% .008 var(--hue));
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); color-scheme: light; }
  body { margin: 0 auto; max-width: 44rem; padding: 24px 16px 56px; font: 15px/1.65 system-ui, "Hiragino Sans", sans-serif; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { margin: 0 0 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--fill); }
  .q { margin: 0 0 8px; font-weight: 750; white-space: pre-wrap; }
  .meta { margin: 0 0 8px; color: var(--muted); font-size: 12px; }
  textarea { display: block; width: 100%; min-height: 5em; margin: 0 0 8px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: inherit; resize: vertical; }
  button { min-height: 44px; padding: 8px 14px; border: 0; border-radius: 10px; background: var(--main); color: var(--paper); font: inherit; font-weight: 750; cursor: pointer; touch-action: manipulation; }
  .muted { color: var(--muted); }
  #say { min-height: 1.6em; color: var(--main); font-size: 13px; font-weight: 700; }
</style>
<p id="say" role="status"></p>
<ul id="questions"></ul>
<script>
  const view = window.__MC_APP_VIEW;
  const root = document.getElementById("questions");
  const say = document.getElementById("say");
  // id → 書きかけの答え。live で行が増えて描き直しても、打ちかけの文字を消さないために持つ。
  const drafts = new Map();
  let can = {};

  const text = (tag, className, value) => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    return element;
  };

  const cardOf = (question) => {
    const item = document.createElement("li");
    const shown = question.published === true ? "公開中" : "非公開";
    item.append(text("p", "q", question.text ?? ""), text("p", "meta", `${String(question.askedAt ?? "").slice(0, 16).replace("T", " ")} · ${shown}`));
    if (!can.correctAny) {
      if (question.answer) item.append(text("p", "", question.answer));
      return item;
    }
    const answer = document.createElement("textarea");
    answer.value = drafts.get(question.id) ?? question.answer ?? "";
    answer.addEventListener("input", () => drafts.set(question.id, answer.value));
    const save = text("button", "", question.answer ? "答えを直す" : "答えを保存");
    save.type = "button";
    save.addEventListener("click", () => saveAnswer(question, answer.value.trim()));
    item.append(answer, save);
    return item;
  };

  const saveAnswer = async (question, value) => {
    if (value === "") {
      say.textContent = "答えが空です。";
      return;
    }
    const written = await view.correct("questions", question.id, { answer: value });
    if (!written.ok) {
      say.textContent = `保存できませんでした: ${written.error ?? ""}`;
      return;
    }
    drafts.delete(question.id);
    if (question.status === "asked") await view.transition("questions", question.id, "answered");
    say.textContent = "保存しました。公開するには、質問の一覧で「公開ページに出す」を押してください。";
  };

  view.onState(({ questions = [] }, viewer = {}) => {
    can = viewer.can?.questions ?? {};
    const newest = [...questions].sort((a, b) => String(b.askedAt ?? "").localeCompare(String(a.askedAt ?? "")));
    root.replaceChildren(...(newest.length > 0 ? newest.map(cardOf) : [text("li", "muted", "まだ質問は届いていません。")]));
  });
  view.ready();
</script>
```

## 出す・引っ込める — 持ち主の操作

公開の印はこのページでは切り替えません。`view.correct` は値を**文字列**で送るもので、`published`
は boolean だからです（文字列の `"true"` を書いても公開にはならない）。

MulmoServer の **`/m/{slug}/records/questions`**（`/m/{slug}` の「記録」から質問を開く）に、
行ごとに「公開ページに出す」「公開をやめる」のボタンがあります。押したのは持ち主（と編集者）
だけが書ける書き込みで、押した瞬間から公開ページに出る・消えるが切り替わります。

**答えを書く前に出すこともできます**（「質問だけ先に載せて、答えは後で」）。公開ページには質問と
「答えを準備中です」が出ます。答えたものだけを載せたいなら、答えを保存してから出すこと —
ルールが見ているのは `published` だけで、答えの有無は見ていません。

## この形が向かないもの

- **全部の質問をすぐ全員に見せる**（質問を見せ合う掲示板）。それは `public.read` で、
  [append-feed.md](./append-feed.md) か [live-poll.md](./live-poll.md) の形
- **質問した本人だけに答えを返す**。公開ページは公開した行しか受け取らないので、本人だけに
  見せる道はここにはありません。`/p/{slug}` の自分の行を見返す形は
  [survey.md](./survey.md) の「回答者に自分の答えを見せるには」
- **件数や割合だけを見せる**（集計だけを公開する）。まだ無い仕組みです
