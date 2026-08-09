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
  stops exactly one — **wired** (§3.1)
- `buildNavigateTarget(slug, itemId, root?)` — the adapter receives the root — **used** (§3.2)
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

Ordered by how much it hurts today. §3.1 and §3.2 are now done — kept here, marked, because what
was decided about them (which roots get a watcher, and why the adapter must not import server
infra) is what the next reader needs.

### 3.1 Per-root watchers — DONE

`server/backends/collectionWatchers.ts` now mounts **one generation per known project** — the
workspace and every saved `cwdPresets` directory — instead of one for the workspace. So a
project's collections get their completion bells and their live refresh on a direct file write,
which is the canonical authoring path.

- **"Open" means "a project this server serves"**, not "a project on screen". A completion bell is
  the notification that the user is NOT looking, so scoping the watchers to the open Collections
  pane would mean a bell can only ring while its collection is already visible. The inotify cost is
  bounded by discovery: a root with no collections mounts no watcher.
- The watched set is reconciled by a **60s poll** (`syncCollectionWatcherRoots`, exported so a
  caller that knows the list just changed can pull the pass forward). A poll because
  `listProjectRoots` reads a live thunk over `cwdPresets` and nothing emits when it changes.
- A root that fails to start does not stop the roots after it, is warned about **once**, and is
  retried on the next pass. Errors carry their `code` (`COLLECTION_ROOT_REQUIRED` distinguishes a
  wiring bug in this file from one directory's problem).
- `WATCHER_ROOT_CONFLICT` is no longer thrown by core 3.1.0 — a second root mounts a second
  generation. `feat-collections-project-root.md` §7b describes the 3.0.0 contract and is now
  historical on that point.

Not done: nothing calls `syncCollectionWatcherRoots` when a directory is recorded, so a project
launched for the first time waits up to a minute for its watcher. Config writes go through several
paths (`POST /api/config`, `cli-init`) and the poll covers them all.

### 3.2 Notification deep links — DONE

A bell now carries its project, as the **opaque id**, both in the URL
(`/collections/<slug>?selected=<itemId>&project=<id>`) and on `action.target.project`.

- `buildNavigateTarget` / `buildPluginData` take the project, and
  **`collectionWatchers.ts` resolves root → id** (`projectIdForRoot`, new in `project-root.ts`).
  The adapter stays free of server infra deliberately: `test/src/utils/collectionNotified.spec.ts`
  imports it, so pulling `node:crypto` in through it puts Node's globals into a DOM-typed project
  and `window.setTimeout` stops returning a number — a real, confusing typecheck failure.
- **Cross-app parity holds where it is observable**: the id is omitted for the workspace, so the
  only link MulmoClaude can produce or receive is byte-for-byte what it was.
- The client half: `browseRouteProjectId()` reads it from the route query, the browse pushes
  **carry** the open project (a ref hop inside a project stays in it) while a bell passes its own
  explicitly (`null` for a workspace bell, so it does not inherit an open project), and
  `CollectionsBrowseOverlay`'s surface takes its `projectId` from the route via a getter. The
  plugin views are **keyed** by project so a same-path project switch refetches.
- `collectionNotifiedSeverities` now matches the project too. That is not theoretical: with a
  `primaryKey` schema the record id is drawn from the data, so the same record in two projects has
  the SAME id and an unscoped reader accents the wrong card reliably rather than rarely.

Still open (upstream): MT publishes ROOTED bell ids while MulmoClaude publishes root-less ones for
the same workspace. Core's sweep handles it asymmetrically — MT's rooted sweep clears a root-less
entry (`drop-legacy`) and republishes, while MulmoClaude's root-less sweep `skip`s a rooted one, so
alternating between the apps can leave a stale bell MulmoClaude will not clear. Pre-existing since
#1571, by upstream design, and worth confirming with MulmoClaude before anyone "fixes" it here.

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
with a per-root id, so registering one per watched project is the shape — and "which roots" is
now answered by §3.1: `listProjectRoots()`, reconciled by the same kind of pass.

### 3.6 The self-containment check (phase 7)

`feat-collections-project-root.md` §11.4: one function answering "would this collection survive a
clone?" — user-scope dependencies, a sqlite store in a git repo (unmergeable), a data dir excluded
by `.gitignore`, a missing `primaryKey`. Cheap, no upstream dependency, and it is the difference
between the guarantee holding and appearing to hold until someone else pulls.

### 3.7 A live browser check — still owed, and it already cost one dead button

The Collections pane shipped without one. The pane's height, the plugin views inside the shadow
root, and the nav containment are exactly what a test suite does not see. Note that this instance
serves compiled `dist/` with no HMR — a UI change needs `yarn build` and a server restart before it
is visible.

**What the first hand-press found (2026-08-09):** the "Show this folder's collections" button had
never worked. `CellChromeButtons` emitted `toggle-collections`, but `cellChromeBinding`'s
`chromeEvents` object — which every cell binds with a single `v-on` — had no key for it, and
`GridCellEmits` did not declare it. So the emit was dropped inside the cell and `TerminalGrid`'s
handler waited for something nothing ever sent. Fixed by adding the event to both, plus
`cellShellEvents`.

Two things made it survive: an unlistened Vue emit is legal, so `typecheck` was clean; and the
existing "forwards every chrome event" test listed the events BY HAND from the same wrong set of
four. The replacement (`test/src/components/cellChromeForwarding.spec.ts`) derives the expectation
from `CellChromeButtons`' own runtime `emits`, so the next button is covered the day it is added.

The general lesson for the rest of this list: server-side correctness here has been verified by
curl and by specs at every step, and none of that says the feature is reachable.

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
