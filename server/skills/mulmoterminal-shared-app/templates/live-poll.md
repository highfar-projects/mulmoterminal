# Template: a poll that MOVES while people are looking at it (live stream, class, meeting)

An audience answers one question at a time, and the question changes while their page is open. Nobody
reloads anything. This is the shape for a live stream, a lecture, a stand-up quiz — anywhere the
person running it decides what is being asked, right now.

This template is written in English because it is the one most often shown to an audience that is
not yours: the strings in the pages below are what a stranger reads.

**What is different from the other four templates** is the direction the data flows. Everything else
here is a request somebody answers later; this one has a screen that must be right within a second,
in front of many people at once. Two things follow, and they are the whole template:

- **`live` on a view** — the page WATCHES the collection instead of reading it once. Declared per
  view, and only where it is wanted.
- **the fan-out is asymmetric**, so the two pages watch different things. Get this wrong and the bill
  is quadratic. See the table.

## The fan-out, which decides what each page may watch

| | who watches | what | 1,000 people, 10 questions |
|---|---|---|---|
| **1→N** | every viewer | `questions` — nobody writes it from the public page | 10,000 reads |
| **N→1** | the desk only (on the roster) | `votes` — everybody writes it | 10,000 reads |
| **N→N** | — | — | **cannot be declared** |

`views[].live` naming `votes` on the PUBLIC page is refused by publish, in those words: 1,000
visitors watching 1,000 votes is 1,000,000 reads. So **the audience's page cannot show the tally**.
Put the desk on the stream instead — which is what a broadcast does anyway.

The desk MAY watch `votes`, and only because its watchers are the roster: the app enumerates them, so
that side is N→1 by definition however popular the stream gets.

## app.json

```json
{
  "aid": "(init writes this)",
  "name": "Live poll",
  "slug": "live-poll",
  "members": {
    "host@example.com": { "*": "owner" }
  },
  "collections": {
    "questions": {
      "statusField": "state",
      "transitions": {
        "initial": ["draft"],
        "draft": ["open"],
        "open": ["closed"],
        "closed": ["open"]
      }
    },
    "votes": { "submitOnly": true }
  },
  "public": {
    "enabled": true,
    "read": ["questions"],
    "submit": {
      "votes": {
        "auth": "verifiedEmail",
        "idFrom": "auth.uid+field",
        "idField": "questionId",
        "stampField": "votedAt",
        "createFields": ["questionId", "choice", "votedAt"]
      }
    }
  },
  "views": [
    {
      "id": "public",
      "audience": "public",
      "path": "views/poll.html",
      "collections": ["questions"],
      "live": ["questions"]
    },
    {
      "id": "desk",
      "audience": "member",
      "path": "views/desk.html",
      "collections": ["questions", "votes"],
      "live": ["questions", "votes"]
    }
  ]
}
```

### Why each key is what it is

- **`auth: "verifiedEmail"`** — what publish accepts today, and the cost to be aware of: **a viewer
  has to sign in with Google before they can vote**. In a stream that loses people. See "the sign-in
  question" below — the rules already implement the mode that avoids it, and publish does not yet
  allow it, which is one line in `@receptron/sharedapp`.
- **`idFrom: "auth.uid+field"` + `idField: "questionId"`** — the document id becomes
  `uid + "_" + questionId`, so a second vote on the same question is a create where a document
  already exists. Firestore refuses it. **This is what "one vote per person per question" IS** — not
  a check in the page, which anybody can skip.
- **`stampField: "votedAt"`** — the rules pin it to the SERVER's clock and freeze it. The page must
  not send a value (it will be refused); it sends the two fields it has, and the parent supplies the
  sentinel.
- **`votes` is `submitOnly`** — it is not in `public.read`, so nobody can list the votes from the
  public page. The tally exists only where the roster can read it.
- **`transitions` on `questions`** — `draft → open → closed`, and `closed → open` because a host
  reopens a question they closed too early. The desk moves it; the rules judge the move.

### The sign-in question, which decides whether an audience actually votes

`firestore.rules` implements three modes, and the difference matters more here than anywhere else:

| mode | what it asks of a viewer | in a live stream |
|---|---|---|
| `verifiedEmail` | Google sign-in, address confirmed | **most viewers stop here** |
| `none` | nothing | **one vote per person is unenforceable** — press it forty times |
| `anonymous` | that a session exists (the browser makes one silently) | one vote per BROWSER per question, **with no sign-in screen** |

`anonymous` is the mode this shape wants, and the front-end already does its half: it opens the
session by itself, shows no sign-in screen, and says plainly that such an answer belongs to the
browser rather than to an account (mulmoserver #202). What is missing is one line in
`@receptron/sharedapp` — `authProblems` refuses to PUBLISH anything but `verifiedEmail`, deliberately
and as a product decision, not a rules limitation. Until that is lifted this template declares
`verifiedEmail`, which publishes; when it is lifted, change the one key and enable the Anonymous
provider in the Firebase console once.

What `anonymous` is not: an identity. One vote per browser means a phone and a laptop vote twice, and
an incognito window is a new browser.

## .claude/skills/questions/schema.json

```json
{
  "title": "Questions",
  "icon": "help_center",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "fields": {
    "id": { "type": "string", "label": "Question ID", "primary": true, "required": true },
    "order": { "type": "number", "label": "Order", "required": true },
    "text": { "type": "string", "label": "Question", "required": true },
    "choices": { "type": "text", "label": "Choices (one per line)", "required": true },
    "state": { "type": "enum", "label": "State", "values": ["draft", "open", "closed"], "required": true }
  }
}
```

`choices` is one text field, one choice per line — not a list, because the collection pane edits it
as a textarea and a host writes questions minutes before using them.

`order` decides which question the audience sees when more than one is `open`. "One at a time" is the
desk's discipline, not something the rules keep.

## .claude/skills/votes/schema.json

```json
{
  "title": "Votes",
  "icon": "how_to_vote",
  "storage": { "type": "firestore" },
  "primaryKey": "id",
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "questionId": { "type": "string", "label": "Question ID", "required": true },
    "choice": { "type": "string", "label": "Choice", "required": true },
    "votedAt": { "type": "datetime", "label": "Voted at (server)", "required": true }
  }
}
```

There is no voter field, and that is deliberate: the id carries the uid, and an anonymous uid names
nobody. A poll that needs to know who answered is a `verifiedEmail` app, and a different template.

## views/poll.html — what the audience sees

One question, or "waiting for the next one". The three rules of a WATCHED page are all here, and each
of them is something a page that reads once never has to think about:

1. **Do not redraw on a snapshot that changed nothing.** `onState` fires for every update; redrawing
   wipes the radio the visitor has just selected.
2. **When the question changes, drop everything about the previous one** — the selection, the error,
   the "thank you".
3. **Show that a vote landed even though the page will keep receiving updates.** The visitor's own
   vote is not in what they can read (`votes` is not public), so the page remembers it.

```html
<h1>Live poll</h1>
<p id="lede">The question changes as the host moves on. No need to reload.</p>

<div id="waiting">Waiting for a question…</div>

<div id="voteArea" hidden>
  <p id="qtext"></p>
  <div id="opts"></div>
  <button type="button" id="send">Vote</button>
  <p id="notice" role="status"></p>
</div>

<div id="votedArea" hidden>
  <p id="votedMark">Your vote was recorded.</p>
  <p id="votedChoice"></p>
  <p id="votedNext">Waiting for the next question…</p>
</div>

<script>
  const view = window.__MC_APP_VIEW;
  // The questions this browser has already answered. NOT what stops a second vote — the rules do
  // that, because the document id is uid + questionId — this only decides what the page shows.
  const voted = new Map();
  let shownId = null;
  let shownSignature = null;
  let sending = false;

  const show = (which) => {
    document.getElementById("waiting").hidden = which !== "waiting";
    document.getElementById("voteArea").hidden = which !== "vote";
    document.getElementById("votedArea").hidden = which !== "voted";
  };

  const notice = (message) => {
    document.getElementById("notice").textContent = message ?? "";
  };

  const choicesOf = (question) =>
    String(question.choices ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");

  /** The question on screen: the lowest `order` among the open ones. */
  const openQuestion = (rows) =>
    rows
      .filter((row) => row?.id && row.state === "open")
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .at(0) ?? null;

  const drawVote = (question) => {
    document.getElementById("qtext").textContent = question.text ?? question.id;
    const host = document.getElementById("opts");
    // textContent, never innerHTML: the question and its choices are typed by a person, and this
    // page is public. A choice containing markup would otherwise run in every viewer's browser.
    host.textContent = "";
    for (const [index, choice] of choicesOf(question).entries()) {
      const line = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      // One name for the whole question, which is what groups radios. No <form> — the sandbox has
      // no `allow-forms`, and a form here would submit nothing.
      radio.name = "choice";
      radio.value = choice;
      radio.id = `choice-${index}`;
      const caption = document.createElement("span");
      caption.textContent = choice;
      line.append(radio, caption);
      host.append(line);
    }
    document.getElementById("send").disabled = false;
    notice("");
    show("vote");
  };

  const drawVoted = (questionId) => {
    const choice = voted.get(questionId);
    document.getElementById("votedChoice").textContent = choice ? `You answered: ${choice}` : "";
    show("voted");
  };

  view.onState((state) => {
    const question = openQuestion(Array.isArray(state?.questions) ? state.questions : []);
    if (question === null) {
      shownId = null;
      shownSignature = null;
      show("waiting");
      return;
    }
    if (voted.has(question.id)) {
      if (shownId !== question.id) {
        shownId = question.id;
        shownSignature = null;
        drawVoted(question.id);
      }
      return;
    }
    // Rule 1: the same question arriving again is not a reason to redraw — it would clear the
    // radio the visitor is in the middle of choosing.
    const signature = `${question.id} ${question.text ?? ""} ${question.choices ?? ""}`;
    if (question.id === shownId && signature === shownSignature) {
      return;
    }
    // Rule 2: a different question means the previous one's selection and message are gone.
    shownId = question.id;
    shownSignature = signature;
    drawVote(question);
  });

  document.getElementById("send").addEventListener("click", async () => {
    if (sending || shownId === null) {
      return;
    }
    const picked = document.querySelector('input[name="choice"]:checked');
    if (picked === null) {
      notice("Choose one of the options.");
      return;
    }
    const questionId = shownId;
    sending = true;
    document.getElementById("send").disabled = true;
    notice("Sending…");
    // `votedAt` is NOT sent: the rules pin it to the server's clock, and a value from here is
    // refused. The parent raises its own confirmation before anything is written.
    const answer = await view.submit("votes", { questionId, choice: picked.value });
    sending = false;
    if (answer?.ok) {
      // Rule 3: remember it. The visitor cannot read the votes back — that is the whole point of
      // `submitOnly` — so nothing in the next snapshot would tell the page this happened.
      voted.set(questionId, picked.value);
      if (shownId === questionId) {
        drawVoted(questionId);
      }
      return;
    }
    document.getElementById("send").disabled = false;
    notice(`Could not vote: ${answer?.error ?? "unknown error"}`);
  });

  view.ready();
</script>
```

## views/desk.html — what the host runs (and puts on the stream)

Watches both collections. Counts on the client: there is no server code here, so nothing writes a
counts document — and nothing needs to, because the roster is the only audience for this page.

```html
<h1>Poll desk</h1>
<div id="tally"></div>
<div id="list"></div>
<p id="say" role="status"></p>

<script>
  const view = window.__MC_APP_VIEW;
  const say = (message) => {
    document.getElementById("say").textContent = message ?? "";
  };

  const choicesOf = (question) =>
    String(question.choices ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");

  const openQuestion = (questions) =>
    questions
      .filter((question) => question.state === "open")
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .at(0) ?? null;

  /** The tally of the question on screen. Recomputed from the rows on every snapshot — the numbers
   *  ARE the rows, so there is nothing to keep in step. */
  const drawTally = (question, votes) => {
    const host = document.getElementById("tally");
    host.textContent = "";
    if (question === null) {
      host.append(Object.assign(document.createElement("p"), { textContent: "No question is open." }));
      return;
    }
    const counts = new Map(choicesOf(question).map((choice) => [choice, 0]));
    for (const vote of votes.filter((row) => row.questionId === question.id)) {
      counts.set(vote.choice, (counts.get(vote.choice) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    host.append(Object.assign(document.createElement("h2"), { textContent: question.text ?? question.id }));
    host.append(Object.assign(document.createElement("p"), { textContent: `${total} vote(s)` }));
    for (const [choice, count] of counts) {
      const row = document.createElement("p");
      const share = total === 0 ? 0 : Math.round((count / total) * 100);
      row.textContent = `${choice} — ${count} (${share}%)`;
      host.append(row);
    }
  };

  /** Every question, with the one button its state allows. */
  const drawList = (questions, votes, viewer) => {
    const host = document.getElementById("list");
    host.textContent = "";
    for (const question of questions.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))) {
      const row = document.createElement("p");
      row.textContent = `${question.order ?? ""} ${question.text ?? question.id} [${question.state}] ${
        votes.filter((vote) => vote.questionId === question.id).length
      } vote(s) `;
      // Drawn from what the viewer may actually do. The same answer is applied again to the intent,
      // so this decides what is OFFERED and never what is allowed.
      const next = question.state === "open" ? "closed" : "open";
      if (viewer?.can?.questions?.transitionAny) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = next === "open" ? "Open" : "Close";
        button.addEventListener("click", async () => {
          button.disabled = true;
          say("Working…");
          const done = await view.transition("questions", question.id, next);
          say(done?.ok ? `${question.id} is now ${next}.` : `Not done: ${done?.error ?? "unknown error"}`);
        });
        row.append(button);
      }
      host.append(row);
    }
  };

  view.onState((state, viewer) => {
    const questions = Array.isArray(state?.questions) ? state.questions : [];
    const votes = Array.isArray(state?.votes) ? state.votes : [];
    drawTally(openQuestion(questions), votes);
    drawList(questions, votes, viewer);
  });

  view.ready();
</script>
```

## Running it, in the order that works

1. **`init`** — mints the `aid` and reserves the `slug`. **The reservation cannot be taken back**, so
   decide the slug first.
2. **Tell the audience they will be asked to sign in** (or lift the gate and use `anonymous`, above —
   in which case enable the Anonymous provider in the Firebase console before the stream, not during).
3. **Write the questions** into `questions` with `state: "draft"` — from the collection pane, or with
   `manageCollection`. Give them `order` in the sequence you will ask them.
4. **`publish`** — the public page and the desk both appear.
5. **During the stream** — open one question from the desk, close it, open the next. The audience's
   page follows without reloading; the tally moves as votes land.

## What this shape does NOT do

- **No tally on the audience's page.** Not a limitation of the pages: it is the N→N fan-out, and
  publish refuses to declare it. Put the desk on the stream.
- **One vote per ACCOUNT per question, while this declares `verifiedEmail`** — and every viewer has
  to sign in first. On `anonymous` (see above) it becomes one vote per browser and no sign-in screen,
  which is a different trade and the one a stream usually wants.
- **No result after the fact for the audience.** They cannot read `votes` at all. If they should see
  the outcome, publish it as a row in a collection they CAN read — a `results` collection the desk
  writes — rather than opening the votes.
- **Nothing catches up a viewer who arrives mid-question.** They see the question that is open when
  they arrive, and can vote on it. A question closed before they arrived is simply not there.
