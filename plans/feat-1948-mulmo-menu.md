# `[Mulmo ▾]` — open a repository's deck from the cell header (#1948)

## Why this exists

Opening a deck had two routes and both cost the user something. Asking the agent spends a turn
every time. The Files pane's row menu (#1923 / #1933 / #1941) means opening the tree and walking
to the file. A repository holds a handful of decks and they do not move, so the fast gesture is a
list — which the header already has twice, as `[Run ▾]` and `[Skill ▾]`.

## Shape

`MulmoMenu.vue` is `SkillMenu.vue` with a different list. That is deliberate: the two menus beside
it already answer "no candidates, no button", "refetch when the cwd changes", and "drop an
out-of-order response", and a third menu inventing its own answers would be the drift, not the
saving.

```text
DeckMenu pick (absolute path)
  -> Terminal.vue: buildCanvasCard(path, storiesRoots)
       refused -> showHint(reason)          <- where a header action's failure already goes
       card    -> seedCanvasCard + emit     -> TerminalCell -> TerminalGrid.openCanvasFor(uid)
```

Three decisions inside that:

- **The refusal goes to the cell's hint, not the Files pane.** #1941 put it in the pane because
  that is where the click was. This click is on the header, and `runHeaderButton` already sends a
  header action's failure to `showHint`.
- **`buildCanvasCard` is reused, not reimplemented.** It is the same question the row menu asks,
  including the named-root wire path and the `expectPath` check the server does with it.
- **The grid only reveals.** `openCanvasFor(uid)` already enlarges a tiled cell first, so the menu
  works from a tiled cell without a second rule about zoom.

## The candidate list is DISCOVERED, and there is no config key

The alternative was a `decks` key in `.mulmoterminal.json`. Rejected, for a reason that is about
this feature's purpose rather than about taste: the complaint being fixed is "I have to ask the LLM
every time", and answering it with "write a config file in every repo" moves the work rather than
removing it. #1933 registered the whole workspace subtree as a stories root, so anything discovered
under it is openable with no declaration at all.

A key can be added later to override or order the discovered list. It cannot be taken back once
someone's config file depends on it, which is the asymmetry that decides the order.

## What bounds the walk

Walking a repository is the expensive half, so the limits are part of the design and not a later
tuning:

| bound | value | why |
|---|---|---|
| depth | 4 | a deck kept for a human to find is near the top |
| results | 50 | a menu, not a file browser |
| files opened | 500 | the deck limit bounds what is FOUND; only this bounds the cost of a tree full of JSON that is not decks |
| directories listed | 2000 | depth does not bound this — a monorepo has 1353 directories within four levels (measured); each costs a `readdir` |
| one listing's size | **not bounded** | bounding it means filesystem order, and that is the non-determinism this walk was fixed for (numbers above) |
| skipped dirs | `node_modules`, `.git`, `dist`, `lib`, `build`, `.next`, `coverage`, `out`, `.cache` | none of them holds a deck a person wrote |
| file size | 2 MB | read whole, so it needs a ceiling (CLAUDE.md's large-file rule) |

The four cost limits are stated as a group on purpose. Three of them arrived as separate review
findings on this PR — decks, then files opened, then directories listed — which is what a rule
looks like when it is being enumerated rather than said. The rule: **what the menu shows** is a
product decision (depth, decks); **what the scan may spend** is a cost decision, and it exists
because the shape of the repository is not ours to choose.

**What is not bounded, on purpose:** the size of a single directory listing. `readdir` has no
partial form that keeps an order — `opendir` streams, but in filesystem order, which is the
non-determinism the walk was fixed for. Measured on a 50,000-entry directory: `readdir` 34 ms,
sorting all of it 21 ms, streaming the first 500 4 ms. 55 ms once per directory change, on a
directory shape that does not occur in a source tree with `node_modules` skipped, is the price of
an answer that does not depend on which machine asked.

`.json` alone is not the test — `package.json` and `tsconfig.json` would fill the menu. A candidate
must PARSE and carry `$mulmocast`. The title shown is the script's own `title` when it has one,
the file name otherwise.

The rules (which directory to skip, which parsed object is a deck, what to call it) are pure and
live in their own file with the walk as a thin shell over them, so the part worth testing is the
part that has no fs in it.

## Not doing

- No config key (above).
- No cross-workspace listing: a cell outside the registered stories root shows no button, because
  nothing it could list is openable. The client asks `canOpenInCanvas` — the same gate the row
  menu uses — rather than a second containment rule.
- No watching. The list is refetched when the cwd changes, like `[Skill ▾]`; a deck added while
  the menu is open appears the next time the cell's directory changes or the tab reloads.
