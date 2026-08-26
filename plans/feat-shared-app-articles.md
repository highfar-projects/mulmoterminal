# Shared apps — publishing articles

**Status**: implemented across four repositories; **not released** — `@receptron/sharedapp` is
unpublished and `firestore.rules` is undeployed. See "What is left" at the end.
**Date**: 2026-08-25
**Prerequisites**: [`docs/shared-app-principles.md`](../docs/shared-app-principles.md) (the invariants) and
[`plans/feat-shareable-collections.md`](./feat-shareable-collections.md) (D1–D10)
**Related**: [`plans/feat-shared-app-platform.md`](./feat-shared-app-platform.md) (this is a new
capability, judged by that plan's one criterion), [`plans/feat-shared-app-mcp.md`](./feat-shared-app-mcp.md)
(`useSharedApp`, which is how an article gets published)

## In one line

> **An article is a RECORD whose document id is its URL name and whose body is markdown, written
> through `useSharedApp` by somebody on the roster, and drawn by a reader the declaration names.**

Nothing about it is a page the author uploads. That is the whole point: it keeps the declaration
the place where the truth is (principle 11), and it keeps the author's machine out of the
execution path (principle 1) in a stronger sense than any existing capability — publishing an
article does not require the author's Mac to be awake, or even to exist.

---

## Why this is not the design we started from

The first shape considered was **publish-time projection**: markdown files in the repository,
compiled into `apps/{aid}/config/article:<slug>` documents by `manageSharedApp publish`, exactly
the way a view's HTML is compiled today. It reads well — git is the source of truth, publish is
the deploy — and it was rejected for one reason:

**it puts the author's machine back in the execution path.** Under that shape, publishing an
article means running `publish` on the repository, which means the author's Mac, which means the
magazine has exactly one person who can add to it and one machine it can be added from. D7 says
the author's machine is not in the execution path of a *published* app; a publishing system whose
every article requires it has read D7 as being about serving traffic, when it is about **whether
the app can be handed to people**.

Making an article a record inverts that. A contributor with a role publishes from anywhere,
through the same tool they use to take part in any other shared app, judged by the same deployed
rules. The owner's repository holds the *declaration* — what an article is, who may write one,
how one is drawn — and never the articles.

The cost is real and is accepted: **the article's markdown lives in Firestore and not in git.**
There is no revision history but the rules' own, no `git log`, no pull request over a correction.
For a magazine whose issues are drafted in a repository, the repository stays where drafting
happens; publishing is the moment the text leaves it.

---

## What the deployed system already does

Checked against the code rather than remembered, because most of this capability turns out to
exist already:

- **`useSharedApp submit` writes a real record** into a collection, keyed by `public.submit[cid]`,
  values as strings, judged by the deployed rules with the signed-in person's own credentials
  (`server/backends/sharedApp/participate/submit.ts`). Publishing an article needs **no new tool
  action** — an article is a submission.
- **`audience: "participant"` already restricts who may submit** to people the roster carries as
  participants (`../mulmoserver/firestore.rules:903`). A magazine that publishes to the world but
  is written by an invited few is a declaration, not a feature.
- **`public.read` makes the collection world-readable** signed out, and `limit` gives the index
  page the latest N by `stampField` (`../mulmoserver/src/firestore/publicApp.ts:148`).
- **`stampField` fixes publication time** on the server at create and freezes it, so an article's
  date cannot be backdated even by the owner, and the index's order is not forgeable.
- **A single document `get` by id is already permitted** to anonymous readers in a `public.read`
  collection — `publicRead(a, cid)` is one of `readWith`'s branches and asks nothing about the
  reader. An article URL is a read the rules already allow.
- **`config/{docId}` is `allow read: if true`** — which is why articles do NOT go there. See A4.

So the gap is three things: an id that is a slug, a reader that draws markdown, and a way to fix
a typo.

---

## Decisions

### A1. An article is a record, not a published document

`apps/{aid}/collections/{articles}/items/{slug}`. Not `config/article:<slug>`.

Three consequences follow and all three are the reason:

1. **Anyone the declaration admits may publish one**, through `useSharedApp`, from any machine.
   `config/*` is `allow write: if role(a,'*') == "owner"` — putting articles there would mean
   only the owner publishes, from the one checkout that holds the aid.
2. **The rules judge it.** `createFields`, `audience`, `validate.required`, `transitions`,
   `selfUpdate` and `stampField` all apply to an article because an article is a record. Under a
   config projection none of them would: publish writes what it is told.
3. **A correction is an update**, judged by `selfUpdate[status]`, and not a re-publish of the
   whole app.

### A2. The document id is the URL name, and it needs a new id mode

Principle 4: uniqueness lives in the document id. An article's URL name is the thing that must be
unique, so the URL name is the document id and two writers racing for one name is a create
collision that Firestore decides atomically.

None of the four deployed id modes expresses it. `auto` gives no name; `auth.uid` is one row per
person; `auth.uid+field` puts the writer's uid in the URL; `field` requires `idIn`, i.e. the name
must already exist as a row in another collection (the booking pattern — right for a commissioned
slug, wrong for "write an article").

So: **`idFrom: "slug"`**, with `idField` naming the field the name is submitted in.

```json
"public": {
  "submit": {
    "articles": {
      "idFrom": "slug",
      "idField": "slug",
      "audience": "participant",
      "createFields": ["slug", "title", "summary", "body"],
      "stampField": "publishedAt",
      "validate": { "required": ["slug", "title", "body"] }
    }
  }
}
```

The rules check three things and no more: the field is present and is a string, the document id
**equals** it, and it matches a grammar. The grammar is `^[a-z0-9][a-z0-9-]{0,63}$` — the same one
`VIEW_ID_PATTERN` already uses for a view id, and for the same reason: this value becomes a path
segment, so a `/` in it addresses somewhere else entirely and a `.` or `__…__` is not a legal
document id.

**`idIn` is NOT required here, and that is the difference from `field`.** `field` says "this
record is *for* that one", so an unchecked id is a claim on a resource that may not exist;
`slug` says "this record is *called* that", which is a claim about nothing but itself. The
grammar is what stands in `idIn`'s place, and it has to be in the rules rather than in publish,
because publish does not see a submission (principle 2).

**`idHeld` already covers the rest.** The value an id was built from cannot move on update
(`firestore.rules:idHeld`), so an article cannot be renamed out from under its URL. That is
inherited, not added.

#### What this costs, in expressions — MEASURED

Principle 10: the `items` create path is shared, and **every app in the deployment pays** for
what is added to it. The new branch is one `s.idFrom == "slug"` comparison plus, only when that
matches, a field presence, an `is string`, an equality and a `matches()`. Existing declarations
short-circuit on the first comparison.

**Measured, on `rules_booking.ts` — the heaviest create in the suite — before and after the
change: 10 over-budget evaluations both times, 20/20 passing both times.** The number is not
zero because it was not zero before: those are the moot create halves of a `set` over an existing
document, which `createWith`'s own comment already names as pre-existing and unfixed by the
`refIn` split. What the comparison establishes is that **this change adds no new over-budget
path**, which is the question principle 10 actually asks.

A caution for whoever measures next, because it nearly produced a false green here: an
over-budget evaluation **denies**, so `assertFails` passes on it. A suite of negative tests can
therefore go green while proving nothing. What rules that out in `rules_articles.ts` is the pair
of positive tests beside them — same app, same user, same fresh-document create, only the slug
differing, one accepted and one refused. Budget exhaustion would have refused both.

It goes in `fieldIdOk` beside `field` rather than in `idOk`, because — as `fieldIdOk`'s own
comment says — an id mode that is about WHICH RECORD rather than about WHO must bind the desk as
well as the visitor. An editor creating `articles/<anything>` with a `slug` field naming something
else would otherwise leave a record whose id and whose `slug` disagree, and `idHeld` would freeze
the mismatch.

**Measure before merging** (checklist item 2): the heaviest declaration in the deployment,
on `items` create, with the branch present. Record the number in this file.

### A3. The body is markdown, and there is no sandbox

An article is prose. It cannot compute, it holds no state, and it is not the app's truth — which
is exactly the condition principle 11 asks for, met by construction rather than by restraint.

So the article page is **not** a View Bridge page: no sandboxed `srcdoc`, no per-render nonce, no
`event.source` check, no parent-drawn confirmation, no `ready`/`onState`. mulmoserver renders the
markdown itself, in its own DOM.

**Which makes the renderer the security boundary**, on mulmoserver's own origin with the reader's
Firebase session live in it. The markdown is written by a stranger to the reader — a contributor,
possibly an LLM working for one — so it is rendered `marked` → `DOMPurify`, with raw HTML
disabled and an href protocol allowlist. That pair is the house answer already
(`src/wikiMarkdown.ts` here, and MulmoClaude's own), and following it is the reference-host rule,
not a preference.

The renderer is **platform code**, which is what makes this acceptable at all: it is not a check
on the author's machine (principle 2), it runs for every reader of every app.

### A4. There are no drafts, because creating is publishing

`publicRead` is collection-level and unconditional — the rules cannot hide a field (principle 5)
and cannot filter rows. So **the moment an article row exists in a `public.read` collection, it is
world-readable**, whatever its status says.

The design does not fight this. A draft is text that has not been submitted yet; it lives in the
contributor's repository, or their editor, or the agent's context. `useSharedApp submit` is the
act of publishing.

An app that genuinely wants editorial review declares **two collections** — a private
`submissions` and a public `articles` — and an editor moves the text between them. That is a
different app, it costs a copy, and it must not be described as a status change on one collection.
Say so in the skill rather than letting an author discover it.

### A5. The index reads whole documents, and what bounds it is `maxLen` x `limit`

The index page reads the articles collection with `limit: { rows, field: stampField }` — the
latest N, descending, which is what `ProjectedViewCollection.limit` already projects. Those are
whole documents, bodies included: rules cannot project fields away (principle 5), so a 20-article
index downloads 20 article bodies.

At a magazine's scale that is a few hundred KB and is fine. The escape hatch when it stops being
fine is **not** a rule and not a filter — it is principle 3's second aggregation shape, an atomic
mirror: a `articleIndex` collection carrying title/date/summary, written in the same batch as the
article and required by the rules with `getAfter()`, the way `mirror` already works for a booking
slot. **Do not build it until it is needed**, and do not reach for anything else when it is.

**Revised 2026-08-26, and this paragraph is why.** "A few hundred KB" was an assumption about two
numbers the declaration did not carry. `limit` was **optional** on an article view, so an app could
publish an index that reads every article ever written; and nothing capped a body at all, so the
ceiling on one row was Firestore's 1 MiB document, chosen by whoever wrote the article rather than
by the app. Codex named both in the architecture review, and both were real. See A8 — the mirror
above is still the answer when the product of the two stops being enough, and is still not built.

### A6. `useSharedApp` gains an `update` action

The tool can create, transition, assign and withdraw. It cannot change a record's fields, so a
published typo cannot be fixed through it — the only correction available is `withdraw` and
re-submit, which changes the URL if the slug changes and takes a new `stampField`, moving the
article in the index.

The rules already carry the branch: `selfUpdate[<current status>]` names the fields a submitter
may edit in each state, it is projected, and mulmoserver's own pages use it. What is missing is a
verb.

`update` takes `cid`, `id` and `values`, and writes only the fields `selfUpdate` names for the
record's current status. Refusals name the declaration as every other refusal does; the rules
answer last.

**Not a general patch.** The tool's vocabulary is closed on purpose, and this keeps it closed:
the writable set comes from the published declaration, per status, and a field outside it is
refused here before the rules refuse it — so the refusal can say which field and which status.

### A7. The article reader is a declared view type, not a second drawing path

`plans/feat-shared-app-platform.md` lists **"a second drawing path on the public page"** under
what will not be done — meaning a naive rendering of `public.read` living beside declared views.
An article page is exactly the thing that prohibition was written about, so it arrives the way
`schedule` is planned to (that plan's item 1): as a **declared view type**.

```json
"views": [
  { "id": "public", "audience": "public", "type": "article",
    "collection": "articles",
    "fields": { "title": "title", "body": "body", "summary": "summary", "date": "publishedAt" },
    "limit": { "articles": 20 } }
]
```

`type: "article"` with no `path`: the page is the platform's, and the declaration says which
collection holds articles and which field is which. An app wanting a bespoke index writes an
ordinary HTML view over the same collection and gets the sandbox back — the two coexist because
one is declared and one is authored, which is the distinction that has always decided this.

**This is the key that must not be added quietly.** It is the first view type, so it establishes
how the reader chooses between "draw this HTML" and "draw this collection"; `appProtocol` decides
whether an older reader may draw an app that declares one. A reader that does not know
`type: "article"` must refuse the app rather than fall through to the form — see the ordering
below.

---

### A8. The length of an article is declared, and checked where the writing happens

An article body carries `public.submit[cid].maxLen: { <field>: <chars> }`, and it is **not a
rule**.

That is a decision rather than an omission. A length test on `items` create and update sits on the
path **every app in the deployment writes through**, so its expressions are paid by apps that have
no articles (principle 10). What it would buy is a bound against somebody the owner **invited** —
`type: "article"` requires `audience: "participant"`, so the only people who may write an article
are the people a roster names. Set against a cost every app pays, a bound over invited writers is
worth having at the gate and at the host, and not in the rules.

So it is enforced twice, in the two places the writing passes through:

- **publish** checks the declaration — the cap exists, it names a real text field, it is under what
  a Firestore document can hold, and **`limit` x `maxLen` is what a reader pays on every open of
  the index**. That product is the number this whole decision is about, and publish is the only
  place in the system where it can be computed before somebody pays it.
- **the host** (`useSharedApp submit` / `update`) refuses an over-long value before sending it, so
  the refusal names the field and the cap instead of arriving as a rules error.

**What it does not bind is a participant writing straight to Firestore**, and that is the accepted
cost — the same shape as every other host-side check here (principle 2: the host buys a refusal
with a name, and the rules answer last). It stops the accident and the runaway agent, which is
what the writers of a magazine actually produce.

`audience: "participant"` is the load-bearing half. Let a collection with `type: "article"` be
submitted to by the world and `maxLen` becomes a comment, so publish refuses that pair.

**A dead end found while writing the gate**: an article collection with no `public.submit` block
could not be published either way — the index needs `limit`, `limit` needs a `stampField` to order
by, and `stampField` lives in `public.submit[cid]`. It now refuses by naming the collection.

## The URL

```text
/a/{slug}                     the index
/a/{slug}/{articleId}         one article
```

A second segment under the public entrance, not a new entrance. `/a/` was chosen over the top
level so app names cannot shadow the site's own pages (`src/router/index.ts`), and an article is
inside its app rather than beside it.

`MemberApp` already owns `/m/{slug}/{id}` and `/p/{slug}/{id}`, so the shape is established. The
one thing to be careful of is route ORDER, which that file is explicit about.

---

## Cross-repo order

Per `feat-shared-app-platform.md`'s ordering, and the two easily-forgotten facts it names —
**rules are deployed by hand**, and **a reader ships before what it reads**.

1. **`../mulmoserver` — rules + emulator tests.** `idFrom: "slug"` in `fieldIdOk`; the grammar;
   the expression count measured on the `items` create path. Positive tests as well as negative
   ones (checklist item 8): a legal slug is accepted, a second writer taking the same one is
   refused, a slug with a `/` is refused, a rename after create is refused by `idHeld`.
   **Then deploy it by hand**, and note the date here — nothing else records it.
2. **`../../sharedapp` (`@receptron/sharedapp`)** — `idFrom: "slug"` in `SubmitZ`; `recordId`
   returning the field verbatim for it; `missingIdField` covering it; the grammar refused at
   publish with the same message the rules enforce; `type: "article"` in the view declaration and
   its projection; `publishChecks` refusing an article view whose collection is not readable by
   its audience, whose named fields are not in the schema, or which has no `stampField` to order
   by. Bump, `yarn test`, **publish to npm** — MulmoTerminal consumes `dist/` from the tarball.
3. **`../mulmoserver` — runtime.** The `/a/:slug/:id` route; the article page; the index; `marked`
   + `dompurify` (new dependencies, matching the two hosts); `@unhead/vue` for the per-article
   `<title>` (already a dependency); i18n for both languages; the `type: "article"` branch in
   `usePublicView` and the refusal an unknown type must produce.
4. **`mulmoterminal`** — the `update` action in `useSharedApp` (tool schema, prompt, `intent.ts`);
   `submit` carrying a slug id; the publish gate for the article view type; `preview` drawing it;
   the Collections pane unchanged.
5. **Skill and template.** `server/skills/mulmoterminal-shared-app/` — the routing table entry,
   and a `magazine.md` template beside `salon.md` / `gym.md`. Written only after 1 and 3 are in
   production, per the plan's rule.

## What is deliberately not in this

- **Comments on an article.** They are a second collection with `refIn` pointing at the article's
  status, plus `sealed` and no exit transition — the close-enforcement trio, already deployed
  (`docs/shared-app-principles.md` §6b). Nothing new is needed; it is simply not this change.
- **Social cards.** A scraper does not run JS, so `og:` tags cannot be filled by a Vue page.
  Fixing it means a static shell served by a hosting rewrite — a fixed platform effect in
  mulmoserver, not app code (D8) and not the author's machine (D7). Named here so it is not
  discovered as a surprise; Google itself does run JS and will index these pages.
- **Revision history.** The record holds the current text. See the trade at the top.
- **Scheduled publication.** `window.fromMs` gates *submission*, not visibility, and there is no
  periodic effect to flip a status (`feat-shared-app-platform.md` §6). An article is published
  when it is written.
- **Counting reads.** Rules cannot count (principle 3).

## Open questions

All three are now answered, and the answers are above rather than here:

- **The expression count** — measured, no new over-budget path (A2).
- **Whether `type` moves the major** — it does, and the stamp went back to being PER APP
  (`protocolFor`), which is what `appProtocol.ts`'s own note prescribed for this day. Stamping
  every app 2.0.0 would have made every deployed reader refuse every app published afterwards,
  including ones whose documents did not change at all.
- **Where the slug grammar lives** — in `firestore.rules` (`slugOk`, the authority) and again as
  `SLUG_ID_PATTERN` in the package. **Two statements on purpose**, with the cost written down at
  both: the package's exists only so a host can refuse early and name the field instead of handing
  the writer a bare permission error. Loosening the package's produces worse messages; loosening
  the rules' changes what may be published. If they are ever changed, **the rules go first**.

## What the implementation added that this plan did not foresee

Three things, each because the code said so rather than the design:

- **`selfUpdate` was projected nowhere.** The rules have carried `selfWriteOk` all along, but no
  document said which fields it meant, so `update` had nothing to read. It is now projected onto
  the submitter's tiers (`correctPart`), read back (`addCorrection`) and resolved per reader
  (`ViewCapability.correctFrom`). The read-back is the half that is easy to miss:
  `projectedWriteOf` rebuilds field by field and DROPS what it does not name, so the projection
  alone was invisible — which is exactly how it first failed here.
- **`update` is NOT an `IntentKind`.** That set is the vocabulary a sandboxed page may send its
  parent, and widening it is what principle 11 forbids. What makes the ask available to
  `useSharedApp` is who is asking: an agent on the machine of the person whose row it is. The
  implementation is `participate/correct.ts`, deliberately beside the intent path and not in it.
- **`recordId` refuses a malformed slug by THROWING**, and two call sites had to be guarded
  (`participate/submit.ts`, `previewWrite.ts`) — an exception out of either reaches the agent or
  the author as a stack trace, where both tools promise actionable prose.

## What is left

Neither is code, and the feature does not work until both are done — **in this order**:

1. **Deploy `../mulmoserver/firestore.rules` by hand.** There is CI for the rules and none for the
   deploy, and the deploy state is recorded in no repository. Until this is done, every `slug`
   create is refused by the deployed rules, and the author sees a publish that succeeded.
2. **Bump and publish `@receptron/sharedapp`.** MulmoTerminal consumes `dist/` from the tarball;
   the working tree here is linked into `node_modules` for verification only, so a clean install
   loses every change. It is a MINOR — new keys, no existing meaning moved.

Then, and only then, step 5 of the ordering above: the skill routing entry and a `magazine.md`
template. Written after the rules and the runtime are in production, per this plan's own rule —
a template is copied verbatim by an agent that cannot check it.

**Added 2026-08-26 by A8**, and it rides the same ordering: the publish gate is
`receptron/sharedapp#53` and needs the same bump-and-publish as everything above, after which the
**host preflight** (`useSharedApp submit` / `update` refusing an over-long value before sending it)
lands here. The `magazine.md` template must declare `maxLen`, `limit` and `audience: "participant"`
or it will not publish — which is the point.
