---
title: Blueprints (experimental) — a guide for testers
nav_title: Blueprints (experimental)
layout: default
parent: English
nav_order: 21
description: How to try the experimental Blueprints feature (MulmoTerminal 6.5.0 and later) — setup, a first build, what we would like you to try, and how to report back.
---

# Blueprints (experimental) — a guide for testers
{: .no_toc }

Blueprints interviews you about the app you want, writes the answers up as a specification, and then has Claude Code build it from that specification step by step. It handles documents as well as apps: making a house style, writing, polishing, reviewing, verifying and asking ([Documents](#documents)). It stops only for what a person must decide — approving the specification, anything that costs money, publishing — and otherwise runs to the end on its own.

> **Experimental.** It ships in MulmoTerminal from 6.5.0, but both the screens and what they do are still changing.

1. TOC
{:toc}

---

## What you need

| | Needed |
|---|---|
| Everyone | Node.js 22.13 or later, `yarn`, a signed-in Claude Code (`claude` runs), git |
| Only to try Firebase | A Google account, a Google Cloud billing account you can attach a payment method to, the Firebase CLI (`firebase`), `gcloud`, JDK 21 or later (on macOS, `brew install openjdk@21` is enough) |
| Only to try Cloudflare | A Cloudflare account (a free one is enough). `wrangler` comes with the project; there is nothing else to install |
| Only to try Supabase | Docker Desktop (running), a Supabase account and a Cloudflare account (free ones are enough). The Supabase CLI and `wrangler` come with the project |

Start with a local build (no Firebase). It stays entirely on your machine and needs no cloud setup or spending.

> **Claude usage**: a build starts a Claude Code session for every step, so it uses noticeably more than an ordinary chat.

> **Language**: every task shows its name, questions, steps and examples in English. The documents may be in either language, and the agent writes to you in the report language you pick. The screens themselves follow MulmoTerminal's language setting.

## Running it

```bash
npx mulmoterminal@latest
```

Open `http://localhost:34567`. If the top bar's **More features** menu (the `widgets` icon) lists **Blueprints**, you are ready. (`npx mulmoterminal --version` should say 6.5.0 or later.)

- **Only one MulmoTerminal per machine runs blueprints.** Start a second one and it can show the builds but refuses any change with "Blueprints on this machine are run by the MulmoTerminal on port …".
- A step's agent does not appear in your usual grid; the Blueprints screen shows what it is doing.

## Trust a folder for the builds first {#trust}

The agents work with nobody watching, so Claude Code's "Do you trust this folder?" prompt would stop them for good. A build can therefore only start **inside a folder Claude Code already trusts**. Do this once:

1. Make a parent folder for your trials, e.g. `mkdir ~/blueprint-trials`.
2. Run `claude` in it, answer yes when it asks whether to trust the folder, and quit.
3. For each build, use a folder inside it. A folder that does not exist yet (e.g. `~/blueprint-trials/library`) is made when you press **Start**; a new folder takes its parent's trust, so there is nothing more to trust. `~` means your home folder and can be typed into the field as it is (on Windows, `~\blueprint-trials\library` and `C:\Users\<you>\blueprint-trials\library` are the same folder).

If you skip this and **Start** is refused because the folder is not trusted, press **Open Claude Code here** under the message. Claude Code opens in a new terminal in the folder whose trust counts — the folder itself, or its parent when the folder is still to be made — and asks whether you trust it. Answer it yourself, then come back to Blueprints: what you had filled in is put back, so you only press **Start** again. A build that stops for the same reason partway through (for example, when a step made the folder a git repository) shows the same button on its run view; after answering, select the build and press **Try again**.

> **Do not `git init` the build folder.** A folder that becomes a git repository no longer inherits its parent's trust, and a later step stops. Add git after the build is done if you want it.

## Your first build: "おうち図書館" (home library)

A small app that records the books in your house and who has borrowed which, built and run on your own machine.

1. **More features** → **Blueprints** → **New build**.
2. Under **Start from an example**, press **Use this example** on **おうち図書館**. It fills in the base (local), the kind of system (build anything) and the answers to the questions.
3. **Project folder** is filled in with a new folder for this example, in a place Claude Code already trusts, such as beside your recent builds. If it stays empty (the first time, for instance), enter something like `~/blueprint-trials/library`. Press **Start**: the folder is made and the build begins.
4. Once the first step has written the specification, the build stops at the **specification screen**. This is the part that matters most.
   - Read the specification, and look at anything under **Not decided yet**.
   - To change something, write it in the box underneath and send it (e.g. "let me delete a book too"). The agent revises the specification and replies.
   - When you are happy with it, press **Approve**.
5. The steps then run in order. For the step in progress you see what the agent is doing and how long it has taken. In the list on the left, the builds waiting for your approval or answer, and those that stopped, gather at the top under **Waiting for you**. A build you no longer want to see can be moved out of the way with **Put away** at the top of its page; it goes into the closed **Put away** group at the bottom of the list, nothing is deleted, and **Back to the list** returns it.
   - **Has a question for you**: write an answer and press **Send**.
   - A step whose check fails compares its earlier failures and repairs itself. A step waiting for another build's folder resumes by itself when that build stops. If a step still stops, read **What the check reported** and press **Try again**.
   - Just before the end comes a **Security review** step. The agent reads what was built against OWASP Top 10:2025, fixes what can be exploited, adds tests, and writes `.blueprint/security-review.md`. The check starts the app and sends it the requests an attack would (a foreign `Host` as in DNS rebinding, a change from another site, a malformed JSON body) and requires each to be refused; it also audits the dependencies (`yarn audit`). On Firebase the review comes before publishing to production, and ends by redeploying dev and confirming the page still renders.
6. **Every step is done.** means you are finished. Right under it is **how to start using the app** (`.blueprint/start-here.md`): how to start it (`yarn start`) and the address to open, a checklist that tries each must-have in turn, and where the data lives. Work down it. The folder's `README.md` has the details. On Firebase it gives the production URL and how to make the next change (try it on dev, then publish).

## What we would like you to try

As much as you have time for — and tell us which ones you did.

**The main path**
- [ ] Build the home library to the end, and the app it made works
- [ ] Talk to the specification screen and see the specification change (a few rounds)
- [ ] Build one more example: 家計簿 (household budget), チームのタスクボード (team task board) or 見積書づくり (quotes)
- [ ] Without an example, choose 自由に作る (build anything) and build something you actually want

**Stopping and resuming**
- [ ] Answering a question lets the build carry on
- [ ] **Do not do this** at an approval stops the build there
- [ ] Stopping MulmoTerminal in the middle of a step and starting it again retries that step and carries on
- [ ] The instructions in the questions are enough to do what they ask without getting lost

### From a collection to an app {#from-collection}

Start from one of MulmoTerminal's collections and build an app you own as code, on the local base, on Firebase, on Cloudflare or on Supabase. The whole procedure has its own page: [From a collection to an app](from-collection.html). Choose **コレクションからアプリにする** (from a collection) as the kind, then pick a collection in the workspace under 元にするコレクション (the source collection).

- Pressing Start copies the shape of that collection, and of every collection it links to through `ref` and the like (`schema.json`, `SKILL.md`, the declared views and templates), into `.blueprint/source/` in the new folder. The collection itself is not changed.
- Answer **yes** to 記録（中のデータ）も写しますか (copy the records too) and the records, with the images and files they point at, are copied as well, then moved into the app's database and `data/files/` by the 記録を移す (move the records) step. The move is checked by machine: every record and every stored field has to be in the agreed table with its original value. Personal data in the records comes along too. When the source has fields that may hold it (email fields, and fields named for a person's name, phone, address and the like), pressing Start stops once and lists them; press **Checked: copy it and start** to go ahead. For a shared app the members' email addresses travel with `app.json`, so the same check appears even without the records. Answer **no** and only the shape is copied, giving an empty app.
- On Firebase the records go to Firestore and the images and files to Cloud Storage. They are moved into the emulators first and checked there; production follows after 本番に公開 (publish to production), with a second approval. Production is written with your own Google account (`gcloud auth application-default login`), then read back and compared with the source.
- On Cloudflare the records go to D1 and the images and files to R2. They are moved into wrangler's local state first and checked there, which also puts them in the app `yarn start` serves. Production follows after Cloudflare に公開 (publish to Cloudflare), with a second approval: `yarn import-source --remote` writes them with the account you signed in to with `yarn wrangler login`, and production is read back through wrangler and compared with the source.
- On Supabase the records go to Postgres and the images and files to Storage. They are moved into the local Supabase stack first and checked there, which also puts them in the app `yarn start` serves. The imported records are owned by your own account by default (locally, the seeded user). Production follows after Supabase と Cloudflare に公開 (publish to Supabase and Cloudflare), with a second approval: `yarn import-source --linked --owner <email>`, with the email you signed up with in the published app. Production is then read back through the Supabase CLI and compared with the source. It is written with the account you signed in to with `yarn supabase login` and `link` (no secret key is used).
- A copy is limited to 200 MB. Past that the build is refused before it starts; start without the records instead.
- On the specification screen, every field, view, action and scheduled ingest of the source is listed under a name that says which collection it belongs to (like `books.title`). The spec step does not move on while any is missing. Each action (the ones that ask an agent) and each scheduled ingest comes with a proposed decision — build it, leave it to a person, or drop it — which you can change in the spec conversation before approving. The ones to build are built by the アクションを機能にする (actions as features) step. A step that needs a model becomes a server-side call to the Claude API, with the key in `.env` (a secret on Firebase; on Cloudflare, `.dev.vars` locally and `wrangler secret put` in production; on Supabase, the Edge Functions' `supabase/functions/.env` locally and `supabase secrets set` in production). The ones left to a person get their steps in the README.
- A **shared app** can be the source too. Any folder among the workspace and the saved ones that holds an `app.json` is listed under Shared apps in the source picker. Picking one copies the whole app (its `app.json` and the shape of every collection), and the spec carries its declaration — members and roles, public submissions, who sees what, mail — over into who-can-do-what, each part named (`app.members`, `app.public.submit.<collection>`, …) and checked by machine. With records, they are read from Firestore with your own sign-in: connect to the shared apps first, and hold a role that reads every record (owner, editor or viewer). Otherwise the start is refused with the reason.
- The copy is taken once, when the build starts. If the source (the collection or the shared app) changes afterwards, opening the build shows one line saying so. The build keeps working from its copy; to use the newer data, start a new build from the same source.

### Documents {#documents}

Choose a document task as the kind (the ones listed under 文書のフォルダ, a folder of documents) and the blueprint works on documents instead of an app. Document tasks run only on that base, so no base is asked for (the base is asked for only for an app that can be built on more than one). It checks writing with chaff, which it fetches by itself, so there is nothing to install. Make the folder that holds your documents inside a trusted parent, and choose one of these as the kind:

| Kind | What it does |
|---|---|
| 規約をつくる (make a style from model texts) | Takes "how we write here" from model texts and turns it into rules the machine checks (`chaff.yaml`) and a guide for writers (`STYLE.md`) |
| 文書を書く (write, following the style) | Writes the document you ask for, part by part, following the folder's style |
| 文書を整える (polish, without changing what it says) | Makes existing documents easier to read without changing what they say; the originals are kept. Choose the kind of document (a report, a blog post, a manual, a contract, an FAQ, a glossary, a judgment, a patent, a paper, a story, a poem, a play, a speech, a transcript — every kind chaff measures) and it is also read for what that kind needs (the conclusion first, a deadline on each request, who bears each obligation and by when, …); what would need adding is not written in but listed as a question for the writer |
| 文書を読み解く (review) | Finds contradictions and gaps in a contract or a policy, quoting the text; if you choose, writes the fixes to a separate file |
| 文書を確かめる (verify) | Finds wrong dates, weekdays, order and totals in an itinerary or an estimate, by machine |
| 要約する (summarize) | Summarizes long documents to the length you choose; every sentence carries a quotation, and the machine checks the quotations, that no part was dropped silently, and that every number is in a quotation |
| 用語をそろえる (glossary) | Collects the terms the documents define, terms defined twice and words spelled more than one way into a glossary; if you choose, the spellings to use go into the folder's chaff.yaml, so chaff reports the others from then on. The finished build's **What to do next** offers polishing the same documents, which corrects the spellings |
| 文書のフォルダに chaff を入れる (adopt) | Sets chaff up in an existing folder of documents: a chaff.yaml for their kind, today's findings shelved so only new ones are reported, and, if you choose, a GitHub workflow that puts new findings on a pull request's lines (offered only when the folder is the top of a git repository). The shelved findings can be worked through from the finished build's **What to do next**, or later: 「文書を整える」 (polish) offers 「棚上げした指摘も直す」 (fix the shelved findings too) in such a folder |
| 版を比べる (compare) | Pairs the articles of an old and a new version of a contract or a policy, and makes a comparison table of what changed, was added or was removed; whether an article changed is decided by comparing its text by machine |
| 文書に尋ねる (ask) | Answers your questions about a document, saying where in it the answer is written |

Clicking the **Project folder** field offers the folders of your earlier builds and the folders saved in MulmoTerminal to pick from (typing a path works too). For your own documents, questions such as the documents to review or the files to polish have **Pick from the folder** under them: it lists the files in the folder, and clicking one adds it (one per line; typing them in works too).

When a build stops with 「承認が必要です」 (approval needed), open the files under **Read these before approving** (the findings, the brief, the outline and so on), and press **Approve** once you have checked them. To change something, or to answer the brief's open questions, write it under **Send changes or answers**: the agent edits those files and replies, and you approve once you have read them again. An answered question leaves the open questions, and the next step uses the answer as a fact.

You can try them without documents of your own. 「例から始める」 (Start from an example) has document examples, under the 文書のフォルダ heading: review a service contract, review an online shop's terms of service, verify an itinerary, verify an estimate, compare a revised service contract, compare a revised travel-expense regulation, ask an expense manual, ask a leave policy and its guide, summarize an expense manual, summarize a review report for a department head, align the terms of a telework policy and guide, set chaff up on help pages, polish a notice, polish a report as a report, polish a blog post as a blog post, polish a blog post written in English, polish a manual as a manual, polish a regulation as a regulation, make a style from model texts, and write a first-day guide. Choosing one fills in a new folder, and starting places its sample documents there. If you pick an existing folder instead, a different file of the same name in it stops the start. When it finishes, the report (what was found, what was checked, what was left) is shown in the blueprint screen. The files the build changed are listed too; clicking one opens it. A task that keeps the originals (polishing, for one) also shows each document against its original: what was taken out and put in, inside the document as it is now, with unchanged stretches folded so only the changes and the lines around them show.

In a folder where you made a style, the finished build's **What to do next** offers writing and polishing with it. Choosing one opens the new-build form with the same folder and 「このフォルダの規約」 (this folder's style) already chosen; read the questions and press **Start**. 「このフォルダの規約」 is offered only where it can work: writing needs both STYLE.md and chaff.yaml, polishing needs chaff.yaml, and following the guide needs STYLE.md. Where a file is missing the question is not asked, and the one choice left is used. After writing, it offers polishing, with the documents just written, the same style, and 「手引き（STYLE.md）の決まりにも合わせる」 (follow the guide too) filled in: chaff already checked every part while it was written, so polishing against the guide is what is left.

- [ ] 文書を確かめる (verify a document): given an itinerary or an estimate, the machine finds a weekday that does not match its date, events out of order or overlapping, and a total that is not the sum of its lines, and the report lists them. Try an itinerary with a wrong weekday and a wrong total on purpose, and see both reported
- [ ] 文書を読み解く (review a document): a contract's or a policy's references to articles that do not exist, and its contradictions, come back with quotations from the text. Where chaff got it wrong (a finding the review dismissed, or a structure problem chaff missed), a draft report to chaff is left in `.blueprint/chaff-feedback/`. Nothing is sent: read it and decide whether to send it
- [ ] 文書に尋ねる (ask a document): a question is answered with where in the document the answer is written

**Cloudflare**

The Cloudflare base builds an app made of a Worker (the API), D1 (SQLite data) and a Vue screen served by the same Worker. Until the end it runs only on your computer with `wrangler dev`; the Cloudflare に公開 (publish to Cloudflare) step publishes it, after your approval. To publish, you run `yarn wrangler login` yourself to sign in to Cloudflare (the blueprint never handles an API token). A published app can be opened by anyone with its URL, so settle the sign-in and what a signed-out visitor may see while the spec is being written.

- [ ] Build 自由に作る (anything) on the Cloudflare base: it runs locally with `yarn start` and the same way at the published URL
- [ ] The start page shows the published URL and a checklist of what to try

**Supabase**

The Supabase base builds an app whose data, sign-in and permissions live in Supabase (Postgres), with a Vue screen served from Cloudflare. The screen reads and writes Supabase straight from the browser, so who may read or write what is decided by row level security (RLS) on each table; the spec says, for every table, who may read, add, change and delete. Until the end it runs only on your computer, against the Supabase stack in Docker that `yarn start` starts. Besides Supabase's own security linter, the security review tries every table as a signed-out visitor and as a signed-in user who owns nothing, and passes only what the spec allowed. Publishing is the Supabase と Cloudflare に公開 (publish to Supabase and Cloudflare) step, after your approval. You create the Supabase project yourself (the free plan is enough) and run `yarn supabase login`, `yarn supabase link` and `yarn wrangler login` yourself (the blueprint never handles a password or a token).

- [ ] Build 自由に作る (anything) on the Supabase base: with `yarn start` you can sign in and use it locally, and a second account cannot see the first one's data
- [ ] It works the same way at the published URL, and 使い始め方 (how to start) shows the published URL and a checklist of what to try

**Firebase (only if you know your way around it)**

The Firebase base uses two Firebase projects, one for development and a separate one for production, and needs the pay-as-you-go (Blaze) plan. So far only **publishing to the development project** has been verified. Please do not approve publishing to production.

- [ ] With the ミニ SNS (mini SNS) example, you can sign in with Google to the app published to development
- [ ] With base Firebase and kind 社内向け業務アプリ (internal business app), the 稟議 (approval requests) example refuses an account outside the company domain, and the refusal screen is clear
- [ ] When asked to do something in a console, the steps in the question are enough

## When something goes wrong

| What happened | Where to look |
|---|---|
| **Start** is refused with "Claude Code does not trust … yet" | Press **Open Claude Code here** under the message and answer the trust prompt (see [Trust a folder for the builds first](#trust)), and check the folder has not become a git repository |
| **Start** is refused with "… does not exist. A new folder is made only inside a folder that already exists." | Only the last folder is made. Create the parent first, or choose a place inside an existing folder |
| A step stopped | It tried five times by itself and the check still fails. **What the check reported** says why; **Try again** sends it back to repairing |
| A change is refused with `… run by the MulmoTerminal on port …` | Another MulmoTerminal on this machine is running. Use that one, or stop it |
| You want to clear a build's record | Delete that build's folder under `~/.mulmoterminal/blueprints/runs/`. The app's own folder is left as it is |

## How to report

Comment on [issue #2246](https://github.com/receptron/mulmoterminal/issues/2246) with what worked as well as what did not. It helps to include:

- The MulmoTerminal version (`npx mulmoterminal --version`)
- The base, the kind of system, and the example you used (or a summary of what you wrote yourself)
- What you did, what happened, and what you expected
- Screenshots, with the build's URL (`http://localhost:34567/blueprints/…`)
- For a stopped step, the text of **What the check reported**

> Before posting, hide anything you would rather not share — email addresses, project ids, folder paths.

## Known limitations

- Publishing to Firebase production (`protect` onwards) has not been verified for real yet.
- The console steps can drift out of date when the Firebase console changes. If one does not match, tell us which screen and what differed.
- The check after publishing catches a blank page, but can miss an app stuck on its loading screen.
- The Marketplace (installing packs from elsewhere) is a prototype; there is no official list yet.
- The Blueprints screen's own text (buttons, statuses, refusals) follows MulmoTerminal's display language (Japanese, English, Korean, Simplified and Traditional Chinese). The bundled packs' content — the names of what they make, their questions, step names and examples — is in English on any screen language but Japanese, and so are the step names in the build list and the run view. The documents themselves can be English: 「規約をつくる」 (make a style) offers 「英語」 (English) as the language, and chaff checks English text too; the example 「英語のブログ記事を整える」 polishes an English blog post.
- What the agent writes to you — reports, questions, replies — is in the **report language** you pick on the new-build form. It starts as the screen's language, so you can, for example, polish an English document and read the report in Japanese. The documents keep their own language, and a task continued from "Next steps" keeps the same report language.
