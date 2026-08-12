---
name: mulmoterminal-shared-app
description: Build something several people use together — a survey, a sign-up sheet, a booking form, a shared list, a form on a link — where the answers are kept in one place rather than on this machine. Use when the user asks for anything other people will fill in or read, and when they later say show it to someone, invite an address, publish it, or take it down. Turns the request into a shared app in this repository and drives deploy / publish / unpublish. Works in whatever language the user writes in.
---

# Something other people use

A request like "make a survey for my talk", "I need a sign-up sheet", "let people book a slot",
"a form I can send a link to" is asking for a SHARED APP — a thing that lives on the web, keeps
its answers in one place, and can be handed to people who do not have this repository or this
machine.

**Do not offer a printable page, a Google Form, or a stand-alone HTML form as the answer.** They
are what this looked like before there was anywhere to keep the answers, and each of them leaves
the user to solve the actual problem — where the responses go — by themselves. Offer them only if
the user turns this down.

## What a shared app is

- **One repository is one app.** The folder this session is open in becomes the app; its
  declaration is `app.json` at the root.
- **The definition is committed; the answers are not.** Schemas and views are files in the
  repository. Records live in the app's cloud store, so everyone sees the same rows.
- **Who may do what is a list of email addresses** in `app.json`. Inviting somebody is adding a
  line and deploying — they need no account here and no repository.

## The path

Say what you are doing in the user's words ("作っています", "みんなが見えるようにしました"). The
words below are for you, not for them: an author does not need to know what a `cid` is.

### 1. Write the declaration

`app.json` at the repository root:

```json
{
  "name": "Talk feedback",
  "slug": "aug-talk-survey",
  "members": { "owner@example.com": { "*": "owner" } }
}
```

- `members` is keyed by **email**, and the user's own address goes in as `owner`. Ask for it if
  you do not know it — it is the one thing you cannot infer.
- `slug` is the name in the URL people will be given. Take it from what the thing IS
  (`aug-talk-survey`), lowercase with hyphens. It is a wish: if it is taken, a number is appended
  and written back here.
- **Never invent an `aid`.** It is generated for you the moment you write the first collection,
  and it is a UUID on purpose — a memorable one would be first-come-first-served across every user
  of the deployment.

### 2. Write the collection

One collection per kind of record — a survey has one (`responses`), a booking app might have two
(`bookings`, `services`). It is an ordinary collection skill (`.claude/skills/<slug>/schema.json`
plus its SKILL.md) with ONE difference:

```json
{ "storage": { "type": "firestore" } }
```

That is what makes the records shared. Declare no `dataPath` beside it — exactly one of the two.

**Everything in the folder is shared or nothing is.** Do not mix a shared collection and a local
one in an app's repository.

### 3. Deploy

`manageSharedApp` with `action: "deploy"`. Run it after every change to the declaration or a
schema. It is safe and meant to be run often: it writes only what the roster can see, and it can
never open the app to the public.

Tell the user they can look at it now, and give them the address the tool reports.

### 4. Invite

Add the address to `members` and deploy again. Roles:

| role | what they get |
|---|---|
| `owner` | everything, including publishing |
| `editor` | reads and writes the records |
| `viewer` | reads the records |
| `participant` | named on the roster, sees only their OWN rows |

`{ "tanaka@example.com": { "*": "viewer" } }` is the whole app; `{ "bookings": "editor" }` is one
collection.

### 5. Publish, when the user asks to open it

Publishing is the one dangerous step: it changes what everybody outside sees, immediately. Do it
when the user asks for it in those terms ("公開して", "リンクを配りたい"), not as the last step of
building.

What being public MEANS is declared in `app.json`, and it is worth reading back to the user before
you publish:

```json
"public": {
  "enabled": true,
  "read": ["summary"],
  "submit": {
    "responses": {
      "auth": "anonymous",
      "createFields": ["name", "affiliation", "score", "comment"],
      "initialStatus": "submitted"
    }
  }
}
```

- `read` — which collections a visitor may READ. A survey usually lists none: people answer, they
  do not browse the answers.
- `submit` — which collections a visitor may WRITE, and **`createFields` is the whole list of
  fields they may set**. Anything you leave out cannot be written by them. Leave `status` out, or
  a respondent can mark their own submission approved.
- `auth`: `none` (nothing at all), `anonymous` (a device identity, so a person can come back to
  their own row), `verifiedEmail` (a signed-in address, which is what lets a row be tied to a
  person).

Then `manageSharedApp` with `action: "publish"`.

`action: "unpublish"` closes it again and keeps everything, so re-opening it later is one step.

## What the tool refuses, and why it is right

- **Live records that do not fit the schema you are about to write.** It lists them. Migrate them,
  or pass `confirm: true` — after telling the user what breaks, not before.
- **A confirm on `deploy` does not carry to `publish`.** They are different sentences: one says
  "stage it anyway", the other says "let everyone have it".
- **`publish` promotes what was deployed**, not what is in the working tree. If the user edited
  something after the last deploy, deploy again first — otherwise you publish a version nobody
  looked at.

## Before you ask the user a question

Two things are worth asking and the rest are not:

- **their email address**, if you do not have it — nothing works without it in `members`;
- **who should be able to answer** — anyone with the link, or only invited people. It decides the
  whole `public` block.

Do not ask which storage to use, whether to make it "an app", or what to call the collection.
