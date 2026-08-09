# Handoff: collections in any project folder

Written 2026-08-09, at the end of the session that built this. It replaces a long
conversation, so it says what was decided and why — not just what is left.

**Read first**: [`feat-collections-project-root.md`](./feat-collections-project-root.md)
(the consumer-side plan: decisions, phases, §7c the gap audit, §11 clone parity) and
[`project-architecture.md`](./project-architecture.md) (why a Project IS a directory, and why the
four per-project subsystems are one problem). This file is the map on top of those.

---

## 1. Where it stands

**It works end to end, verified in the field.** An agent in `~/git/ai/mag2` was asked to create a
collection, and did: `putSchema` wrote `.claude/skills/newsletters/schema.json` in THAT repo, 168
records landed in `data/newsletters/items/`, `queryItems` aggregated them, and
`presentCollection` rendered the card.

Shipped to MulmoTerminal main:

| PR | What |
|---|---|
| #1571 | `resolveProjectRoot` + the root threaded through ~30 engine calls; the engine bound in EXPLICIT-ROOT mode so a forgotten root throws instead of resolving the workspace |
| #1572 | `?project=<opaque id>`, `GET /api/collection-projects`, and everything keyed by slug alone re-keyed by `(root, slug)` — view tokens, the thumbnail cache, the query cap |
| #1573 | The Collections pane beside Canvas / Tools / Files, scoped to the cell's directory; the agent's `manageCollection` follows its session's cwd; a collection action's chat spawns in the collection's root |
| #1578 | `@mulmoclaude/core@3.1.0`: staging (`data/skills`) is workspace-only, and `schemaDocs` serves a root-appropriate authoring guide |
| #1579 | The canvas is a scope surface, so a `presentCollection` card fetches its own session's project |

Upstream (`@mulmoclaude/core@3.1.0`, receptron/mulmoclaude#2844 — instructions in
`../mulmoclaude/plans/feat-collection-multi-root-2.md`) shipped MORE than MulmoTerminal currently
uses. Confirmed present in the installed package:

- `skillsStagingDir` may return `null`; `schemaDocs` picks its variant from that plus
  `stagedSkillAuthoring` — **both wired**
- **`startCollectionWatchers` mounts one generation PER ROOT, concurrently**, each stamping its
  root on payloads and driving bells whose ids carry it; `stopCollectionWatchers({ workspaceRoot })`
  stops exactly one — **not wired**
- `buildNavigateTarget(slug, itemId, root?)` — the adapter receives the root — **not used**
- `withCardScope` for per-card project — **blocked, see §3.3**
- `feedRefreshTaskDef({ workspaceRoot })` with a per-root task id — MT registers one, for the
  workspace only

---

## 2. The invariants — read these before writing anything

Every one of these was learned by breaking it. Reviews caught roughly fifteen findings on these
PRs and they were nearly all one of the following.

1. **A slug is unique within a root and nowhere else.** Anything keyed on a slug alone — a cache,
   a channel, a token, a notification id, a card — is a cross-project collision waiting to happen.
2. **Presence, not shape, when reading `?project=`.** Express turns `?project=a&project=b` into an
   array; a `typeof === "string"` guard reads that as "absent" and serves the workspace to a
   request that explicitly named a project. `resolveProjectRoot` and `/api/files/raw` both do this
   correctly — copy them.
3. **The root is the trust boundary.** `resolveDataDir` only guarantees containment WITHIN the
   root it is handed. A client may name a project by opaque id, resolved against the server's own
   list; it may never supply a path. A SESSION's cwd is different — that is the server's own
   record of where it launched an agent, and `projectScopeForCwd` accepts it without a membership
   check on purpose.
4. **A view token carries the opaque id, never a path.** Tokens are signed, not encrypted, and are
   handed to an LLM-authored iframe.
5. **`dataUrl` is a bare base URL and must stay one.** The custom-view contract builds endpoints by
   concatenation (`dataUrl + "?fields="`, `+ "/query"`, `+ "/image?…"`). Appending a query to it
   breaks every one.
6. **Scope and navigation belong to the SURFACE being looked at** (`src/composables/collectionSurface.ts`).
   Precedence is by layer first (`"screen"` covers `"pane"`), push order second — a tool result can
   auto-reveal a canvas behind an open browser. A surface may scope without navigating.
7. **`data/skills` is the managed workspace's alone.** It exists to cross the `.claude/`
   permission gate, and MulmoTerminal runs no bridge outside the workspace. Telling the agent
   otherwise makes it write a draft nothing mirrors and nothing discovers — a collection that does
   not exist, with no error anywhere.
8. **Stubbed deps hide wiring bugs.** CI was green on a commit where every calendar-push request
   would have 500'd, because every test for that route injected stubs. When a route resolves a
   root, test it through its LIVE deps too.

---

## 3. What is left

Ordered by how much it hurts today.

### 3.1 Per-root watchers — the one with live consequences

`server/backends/collectionWatchers.ts` starts ONE generation, for the workspace. The collection
created in mag2 declares `completionField` / `completionDoneValues`, so it is asking for a feature
that cannot fire:

- **no completion bells** for a project's collections;
- **no live refresh** when an agent writes records directly — and that is the CANONICAL authoring
  path (the watcher's own header says so: a direct file write has no other producer, so open views
  would never refresh).

Core already supports it (see §1). The MT work is to start a generation for each project the user
has open and stop it when they close it — `stopCollectionWatchers({ workspaceRoot })` releases one.
The contract, including the error codes to branch on (`WATCHER_ROOT_CONFLICT`,
`COLLECTION_ROOT_REQUIRED`) and why the failure is silent if you get it wrong, is
`feat-collections-project-root.md` §7b.

Decide what "open" means — the Collections pane's project is the obvious trigger; watching every
known project would spend inotify handles on directories nobody is looking at.

### 3.2 Notification deep links (§7c C, MT half)

`server/backends/collectionNotifierAdapter.ts` builds `/collections/<slug>` with no project, so a
bell from a project collection opens the workspace's collection of that slug. Core now passes the
root as the third argument to `buildNavigateTarget`. The client route must accept a project too.
The id is opaque — do not put a path in a URL.

### 3.3 Per-card project scope (§7c D remainder) — blocked

core 3.1.0 ships `withCardScope` and `PresentCollectionData.scope`, and the executor deliberately
DROPS a `scope` supplied in tool arguments (the model must not choose a project). But
`@mulmoclaude/collection-plugin@3.0.0` still calls `fetchCollectionDetail(slug)` — it does not read
the field. **This needs a collection-plugin release built against core 3.1.0.** Until then #1579's
surface-level scoping covers the real case (one panel, one session's work); what is missing is two
cards from two projects in the same panel.

### 3.4 The phone (§7c E)

`server/backends/remoteHost/handlers/*` are bound to `workspaceScope()`, so a project's
collections do not exist on the phone. Preparation is specified in
`../mulmoclaude/plans/feat-collection-multi-root-2.md` §8: handlers should resolve a scope from
params defaulting to the host root (so adding the parameter later changes no handler), the scope
must be an opaque id, and the artifact stays host-built.

### 3.5 Per-root scheduled feed refresh (§7c F)

`server/backends/system-tasks.ts` registers `feedRefreshTaskDef({ workspaceRoot })` once. A
project's feeds therefore never refresh on their schedule. Core's task def is root-parameterised
with a per-root id, so registering one per watched project is the shape.

### 3.6 The self-containment check (phase 7)

`feat-collections-project-root.md` §11.4: one function answering "would this collection survive a
clone?" — user-scope dependencies, a sqlite store in a git repo (unmergeable), a data dir excluded
by `.gitignore`, a missing `primaryKey`. Cheap, no upstream dependency, and it is the difference
between the guarantee holding and appearing to hold until someone else pulls.

### 3.7 Never done: a live browser check

The Collections pane shipped without one. The pane's height, the plugin views inside the shadow
root, and the nav containment are exactly what a test suite does not see. Note that this instance
serves compiled `dist/` with no HMR — a UI change needs `yarn build` and a server restart before it
is visible.

---

## 4. Open decisions — not bugs, genuinely undecided

1. **Does the root search walk UP?** Today the root is the session's cwd exactly: a cell opened in
   `~/proj/src` looks for `~/proj/src/.claude/skills` and finds nothing. Options: leave it (simple,
   predictable); walk up to `.claude/skills` (git-like, but a subdirectory cell then writes the
   parent's data); or walk up to `.mulmoterminal.json`, which matches the definition of a Project
   (D2) and was the recommendation. Nothing depends on this until someone opens a subdirectory.
2. **A user-scope dependency in a git-tracked collection (§11 L1)** — warn or refuse?
3. **`generateItemId()` is 4 random bytes.** Two machines creating records offline can collide;
   `primaryKey` avoids it. Widen upstream, or keep the guidance?
4. **Does MulmoTerminal need a skill-bridge for the managed workspace at all?** It declares the
   staging path and mirrors nothing, so an agent authoring a collection skill in the workspace
   FROM MulmoTerminal writes a draft that never becomes active here.

---

## 5. How to work in this repo

- **The gate is `yarn format`, `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test`.** Run all
  five before committing — a build failure was pushed once in this session because commit and
  build ran as separate commands and only the commit was checked.
- **The suite has a genuine flake** (one test failing under parallel load, passing in isolation and
  on re-run). Re-run before believing a single failure; say so rather than quietly re-running.
- **The review bots are worth taking seriously.** On these PRs they found real cross-project leaks
  that CI could not: a query route running against the workspace, a token payload publishing the
  user's home directory, a dataUrl that broke every suffix endpoint. When one is wrong, verify and
  say why with evidence — one claim about a published package was refuted by pulling the tarball.
- **Upstream first for anything shared.** `@mulmoclaude/core` drives MulmoClaude over the same
  workspace; `/api/*` naming authority is MulmoClaude's `src/config/apiRoutes.ts`. The chain is:
  core PR → publish → (republish dependent plugins if the bump crossed a MAJOR — a caret does not
  float across one) → MulmoTerminal bump. `../mulmoclaude/plans/chore-publish-plugins-core3.md`
  is the recipe.
