# Decks in an ordinary repository — more than one stories root (#1951)

## The problem, measured

Both ways of opening a deck — the file tree's row menu (#1923/#1934) and the `[Mulmo]` header
menu (#1948) — only work **under the workspace MulmoTerminal was started in**. A deck in a
repository elsewhere is found and correctly not offered, because nothing could open it.

Verified with a control rather than read off the code: a real deck placed outside the workspace is
**listed by the scan** and **has no button**, while `[Skill]` in the same cell **does** appear — so
the cause is the registered root, not the header.

## Why there is only one root

`@mulmoclaude/mulmoscript-plugin` fixes `extraRoots` at construction — deliberately
(receptron/mulmoclaude#3015): `filePath` is a field a model fills, so an agent must not be able to
name a root, and the id scheme is the host's because it is persisted in cards. MulmoTerminal
registers exactly one: the workspace subtree (#1933).

## The options, and why A

Read the plugin before choosing. `createMulmoScriptServerOps` copies `extraRoots` into its own
`rootDirs` map at construction, so a new root genuinely needs a new instance — and the same
function is documented as **one instance per process**, owning the in-flight movie/PDF dedup sets
and the generation-state tracker.

| | | cost |
|---|---|---|
| **A — register the known set at boot** | one construction, roots = workspace + the user's saved projects | a directory typed AFTER boot is not covered until restart |
| B — rebuild the ops when a root is added | covers a directory typed at any time | **every rebuild discards in-flight generation state** — a movie rendering when a cell opens |
| C — register a common parent | smallest change | widens containment to everything under it, and asks the user to nominate a parent |

**A.** B was the earlier recommendation and it was made without knowing what a rebuild throws away.
A is also what the plugin's own "one instance per process" is asking for.

## Where the set comes from

`getCwdPresets()` — the same saved directories the launcher offers and `listProjectRoots()` builds
on. Nothing new to configure: a directory becomes a root by being one the user launches in, and the
launcher already records those on first launch.

Read ONCE at boot, which is what makes it option A. The collections backend deliberately reads the
same source through a thunk, for the case this design accepts: "launching from a new directory
records one, and a list captured at boot would refuse a project the launcher already shows."

Not `listProjectRoots()` itself, despite it being the same set: it needs `initProjectRoots`, which
runs AFTER the mulmoScript backend at boot. Reading the presets directly avoids reordering boot for
this.

## The wire changes from one root to many

`/api/config` answered `storiesRoot: { id, paths }`. It now answers `storiesRoots: [{ id, paths }]`,
newest concept, same shape per entry. The browser needs every root because its gate is lexical: it
decides which root a path belongs to before asking the server for anything.

Two rules in `storyWirePath`, in this order:

1. **The workspace's own `artifacts/stories`** answers with NO root, exactly as before. It sits
   inside the workspace root's subtree, so both could name one file under two spellings — two
   identities, two cards. Deciding the narrower rule first means only one is ever minted.
2. **Otherwise the LONGEST matching root**, by prefix. Roots can nest (a saved project under the
   workspace), and "the most specific one" is the only choice that does not depend on list order.

## Bounds

| bound | value | why |
|---|---|---|
| roots | 64 | `cwdPresets` is capped at 50 and the workspace is one more; the ceiling is for a hand-edited config |
| existence | checked at boot | a saved directory that has been deleted registers nothing |

## Not doing

- No new config key. A root is a directory the user already launches in.
- No rebuild on demand (option B) — see the table.
- No change to what the `[Mulmo]` menu LISTS: `artifacts/stories` belongs to the workspace, and a
  repository's own decks are still declared. This issue is about what can be OPENED.
