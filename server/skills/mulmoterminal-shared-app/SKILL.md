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

### 1. Start the app

`manageSharedApp` with `action: "init"`, and `name` (and `slug`, if you have one worth wanting).

**Do not compose `app.json` yourself.** The declaration names its owner by EMAIL and it has to be
the address this machine is SIGNED IN with — you cannot read that, and the address the user tells
you is the one that fails at deploy. `init` writes it, generates the `aid`, and refuses if the
repository already declares an app.

`slug` is the name in the URL people will be given. Take it from what the thing IS
(`aug-talk-survey`), lowercase with hyphens. It is a wish: if it is taken, a number is appended and
written back.

The file is an ordinary committed declaration afterwards — you may read it, and the user may edit
it in a pull request. What you should not do is REWRITE it: `invite` changes one roster entry, and
`check` tells you whether what is there would deploy.

### 2. Write the collection

One collection per kind of record — a survey has one (`responses`), a booking app might have two
(`bookings`, `services`).

**A NEW collection is created by writing the files**: `SKILL.md` and `schema.json` under
`.claude/skills/<slug>/`. `putSchema` is EDIT-ONLY and refuses a collection that does not exist
yet ("unknown collection … create it by writing SKILL.md + schema.json"), so do not try to create
one with it. Use it afterwards, to CHANGE a schema.

**Read the shape first**: `manageCollection` with `action: "schemaDocs"`, and
`topic: "Shared storage (firestore)"` for this part specifically. The shape is not what a
reasonable person guesses — `fields` is an OBJECT keyed by field name (not a list), `primaryKey`
and `icon` are required, and the key for a field's human name is `label`. A schema in the shape
you would design does not parse, and a collection whose schema fails validation is **skipped
silently**: nothing errors, it simply never appears.

The one thing that differs from an ordinary collection:

```json
{ "storage": { "type": "firestore" } }
```

That is what makes the records shared. Declare no `dataPath` beside it — exactly one of the two.

**The app already has its `aid`** — `init` wrote it in step 1 — so a shared collection you write
correctly is discovered straight away. If `getSchema` says "unknown collection" after you have
written the files, that is the schema FAILING VALIDATION, not something a deploy will fix: read it
back against `schemaDocs` (`primaryKey` naming a field flagged `primary: true`, `icon` present,
exactly one of `dataPath` / `dataSource` / `storage`). Deploying past it produces an app with the
collection missing and no error anywhere.

**Everything in the folder is shared or nothing is.** Do not mix a shared collection and a local
one in an app's repository.

### 3. Deploy

`manageSharedApp` with `action: "deploy"`. Run it after every change to the declaration or a
schema. It is safe and meant to be run often: it writes only what the roster can see, and it can
never open the app to the public.

Tell the user they can look at it now, and give them the address the tool reports.

### 4. Invite

`manageSharedApp` with `action: "invite"`, `email`, and `role` (omit `role` to remove them). It
edits the roster and nothing else; deploy is what makes it real.

| role | what they get |
|---|---|
| `owner` | everything, including publishing |
| `editor` | reads and writes the records |
| `viewer` | reads the records |
| `participant` | named on the roster, sees only their OWN rows |

`cid` narrows it to one collection instead of the whole app.

Addresses are written in lower case, because the rules compare one exactly and the sign-in token
carries a lower-cased address. An entry with capitals matches nobody, and nothing reports it — the
deploy succeeds and the person is simply refused everything. `invite` lower-cases what you pass;
a roster edited by hand is checked at deploy.

### 4b. Check, whenever you have edited `app.json`

`manageSharedApp` with `action: "check"` runs the gate a deploy runs — the declaration, the
collections it names — and writes nothing. It needs no connection.

Use it after any hand edit, and before telling the user something is ready. The alternative is
finding out at deploy, and a deploy that refuses in the middle is where an agent starts editing
files to recover.

### 5. Publish, when the user asks to open it

Publishing is the one dangerous step: it changes what everybody outside sees, immediately. Do it
when the user asks for it in those terms, not as the last step of building.

What being public MEANS is declared in `app.json`, and it is worth reading back to the user before
you publish. This is a survey anyone may answer once they sign in:

```json
{
  "collections": {
    "responses": { "submitOnly": true, "statusField": "status" }
  },
  "public": {
    "enabled": true,
    "read": [],
    "submit": {
      "responses": {
        "auth": "verifiedEmail",
        "emailField": "email",
        "createFields": ["name", "affiliation", "score", "comment", "email", "status"],
        "initialStatus": "submitted"
      }
    }
  }
}
```

Every line of that is load-bearing, and deploy refuses the declaration without them:

- **`auth` must be `verifiedEmail`.** `none` and `anonymous` exist in the rules and are REFUSED
  here — a product decision, not an oversight. So "anyone with the link, no sign-in" is not
  something you can offer today: a respondent signs in with an email address. Say that to the user
  rather than promising anonymity and discovering it at deploy.
- **`emailField` names the field their address lands in**, and it must be in `createFields`.
- **`submitOnly: true` is required** whenever the submission binds a record to its submitter. The
  record means "this person said this", and without it an owner or editor could write rows that
  carry that meaning without having earned it.
- **`initialStatus` needs `collections.<cid>.statusField`** and that field must be in
  `createFields`. It is NOT a hole: the rules pin the value to `initialStatus` on create, so a
  respondent can only write `submitted` — listing it is what lets the rules check it. What
  `createFields` must NOT contain is anything else you do not want them setting.
- **Only simple fields go in `createFields`**: `string`, `text`, `markdown`, `number`, `boolean`,
  `date`, `datetime`, `email`, and `enum` (whose choices travel with it). A `ref`, `table` or
  `money` field is refused — the public page reads the published form and nothing else, so it has
  no way to draw one — and so is anything the host computes (`derived`, `embed`, `backlinks`,
  `rollup`, `toggle`, `flag`), which is a value nobody may submit. Such fields stay in the
  collection; they are just not what a stranger fills in. `check` names any that slipped in.
- **`read: []`** — a survey lists nothing publicly. People answer; they do not browse the answers.

The simplest correct survey omits status entirely (`submitOnly` + `verifiedEmail` + `emailField`).
Add a status only when somebody is going to work through the responses.

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
- **whether people outside the roster should be able to answer** — it decides whether there is a
  `public` block at all. Ask it in those words: everyone who answers signs in with an email
  address either way, so "public" here means "anyone who signs in", not "anonymous".

Do not ask which storage to use, whether to make it "an app", or what to call the collection.

## Where people actually look — say what is true today

- **The roster's entrance exists.** After a deploy, `manageSharedApp` reports the address; hand
  that to the people you invited.
- **The public page does not exist yet.** Publishing writes everything a public page needs and
  turns the URL name on, but the page that renders it is not built. So do not promise the user a
  link to hand out at an event. What works end to end today is an app used by the people on its
  roster.

Say this at the START, when the user's request implies handing out a link — not after they have
watched you build it.

## If the tools are not here

`manageSharedApp` and `manageCollection` are only offered in a cell whose directory has the
workspace-data tool group. If they are not in your tool list, **stop and say so**: a shared app
cannot be deployed from here, and writing `app.json` and a schema by hand produces files nothing
can act on. Point the user at the launcher's tool-group switch for this folder rather than
carrying on.

## Two refusals that are NOT your cue to start editing

The run this skill was written from lost several minutes to each of these, and both times the
repair made things worse — an `aid` was deleted and a second app was created by accident.

- **`getSchema` / `putSchema` says "unknown collection".** The schema was not ACCEPTED. With
  `init` having written the `aid`, that means it failed validation — read it back against
  `schemaDocs` rather than deploying past it. (Before `init` existed this could also mean "no aid
  yet"; it no longer does, and treating it that way deploys an app with the collection missing.)
- **Anything about permissions on `apps/{aid}`.** The `aid` in `app.json` is the app's identity.
  Removing it does not reset anything: the next deploy mints a NEW one and the old app stays where
  it is, owned by nobody who can reach it. If a deploy is refused, read what it says and fix that;
  never edit the `aid` by hand.
