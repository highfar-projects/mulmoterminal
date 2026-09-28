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

Blueprints interviews you about the app you want, writes the answers up as a specification, and then has Claude Code build it from that specification step by step. It stops only for what a person must decide — approving the specification, anything that costs money, publishing — and otherwise runs to the end on its own.

> **Experimental.** It ships in MulmoTerminal from 6.5.0, but both the screens and what they do are still changing.

1. TOC
{:toc}

---

## What you need

| | Needed |
|---|---|
| Everyone | Node.js 22.13 or later, `yarn`, a signed-in Claude Code (`claude` runs), git |
| Only to try Firebase | A Google account, a Google Cloud billing account you can attach a payment method to, the Firebase CLI (`firebase`), `gcloud`, JDK 21 or later (on macOS, `brew install openjdk@21` is enough) |

Start with a local build (no Firebase). It stays entirely on your machine and needs no cloud setup or spending.

> **Claude usage**: a build starts a Claude Code session for every step, so it uses noticeably more than an ordinary chat.

> **Language**: the packs, the examples and the questions the agents ask are in Japanese for now. The screens themselves follow MulmoTerminal's language setting.

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
3. For each build, use a folder inside it. A folder that does not exist yet (e.g. `~/blueprint-trials/library`) is made when you press **Start**; a new folder takes its parent's trust, so there is nothing more to trust.

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
5. The steps then run in order. For the step in progress you see what the agent is doing and how long it has taken.
   - **Has a question for you**: write an answer and press **Send**.
   - If a step stops, read **What the check reported** and press **Try again**.
6. **Every step is done.** means you are finished. The folder's `README.md` says how to start the app (`yarn start`) and where its data lives. Start it and use it.

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

**Documents (blueprints that work on writing, not apps)**

Choose the base 文書のフォルダ (a folder of documents) and the blueprint works on documents instead of an app. It checks writing with chaff, which it fetches by itself, so there is nothing to install. Make the folder that holds your documents inside a trusted parent, and choose one of these as the kind:

You can try them without documents of your own. 「例から始める」 (Start from an example) has document examples: review a service contract, verify an itinerary, ask an expense manual, polish a notice, make a style from model texts, and write a first-day guide. Choosing one fills in a new folder, and starting places its sample documents there. If you pick an existing folder instead, a different file of the same name in it stops the start. When it finishes, the report (what was found, what was checked, what was left) is shown in the blueprint screen.

- [ ] 文書を確かめる (verify a document): given an itinerary or an estimate, the machine finds a weekday that does not match its date, events out of order or overlapping, and a total that is not the sum of its lines, and the report lists them. Try an itinerary with a wrong weekday and a wrong total on purpose, and see both reported
- [ ] 文書を読み解く (review a document): a contract's or a policy's references to articles that do not exist, and its contradictions, come back with quotations from the text. Where chaff got it wrong (a finding the review dismissed, or a structure problem chaff missed), a draft report to chaff is left in `.blueprint/chaff-feedback/`. Nothing is sent: read it and decide whether to send it
- [ ] 文書に尋ねる (ask a document): a question is answered with where in the document the answer is written

**Firebase (only if you know your way around it)**

The Firebase base uses two Firebase projects, one for development and a separate one for production, and needs the pay-as-you-go (Blaze) plan. So far only **publishing to the development project** has been verified. Please do not approve publishing to production.

- [ ] With the ミニ SNS (mini SNS) example, you can sign in with Google to the app published to development
- [ ] With base Firebase and kind 社内向け業務アプリ (internal business app), the 稟議 (approval requests) example refuses an account outside the company domain, and the refusal screen is clear
- [ ] When asked to do something in a console, the steps in the question are enough

## When something goes wrong

| What happened | Where to look |
|---|---|
| **Start** is refused with "Claude Code does not trust … yet" | Go through [Trust a folder for the builds first](#trust) again, and check the folder has not become a git repository |
| **Start** is refused with "… does not exist. A new folder is made only inside a folder that already exists." | Only the last folder is made. Create the parent first, or choose a place inside an existing folder |
| A step stopped | **What the check reported** says why; **Try again** retries it |
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
