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

## The candidate list is DECLARED — the search was built first, then deleted

The first version searched the workspace for anything that parsed as a mulmoScript. The argument
for it was that the complaint being fixed is "I have to ask the LLM every time", and answering that
with "write a config file in every repo" moves the work rather than removing it.

**The real data killed it.** In one real workspace the search finds **250 decks**:

| where | how many | what they are |
|---|---|---|
| `artifacts/stories` | 33 | the user's own decks |
| `github/mulmocast-cli/scripts/test` | 110 | a checked-out repository's test fixtures |
| its `samples`, `templates`, `styles`, … | 107 | more of the same |

So the menu it produced was the user's 33 decks followed by another project's fixtures, truncated
at a 50-deck cap whose real job was keeping that list from being worse. A search finds what is on
disk, and what is on disk is mostly other people's data.

Two named sources instead:

1. `<workspace>/artifacts/stories` — where the plugin puts what an agent makes. No configuration.
2. `decks` in `<dir>/.mulmoterminal.json` — paths relative to that file, for a deck kept inside the
   repository. This is the shape the original request asked for.

**What went with the search:** the depth limit, the candidate budget, the directory budget, the
deterministic traversal order, and an unbounded `readdir` that four review rounds could not bound
without making the common case slower (`opendir` capped is 0.33 ms → 0.86 ms per directory at 500
entries, and a real workspace visits 1353 of them). Every one of those existed to make searching
safe. Two `readdir`s and a config read need none of it.

## What is left to bound

| bound | value | why |
|---|---|---|
| decks shown | 50 | a menu, not a file browser — reached only by a workspace with an unusual number of decks |
| file size | 2 MB | read whole to be parsed (CLAUDE.md's large-file rule) |
| declared entries | 50 | a config key, capped like `skills` beside it |

Two of these are about what a menu should be. None is about surviving the shape of a repository,
which is what the previous five were for.

A declared path still has to PARSE and carry `$mulmocast`: one naming something else is dropped
rather than offered, because the menu would open it and the server would refuse — the dead button
this area exists to remove. The title shown is the script's own `title` when it has one, the file
name otherwise.

## Not doing

- No search (above). A deck that is neither in the stories directory nor declared is still one
  right-click away in the file tree.
- No cross-workspace listing: a cell outside the registered stories root shows no button, because
  nothing it could list is openable. The client asks `canOpenInCanvas` — the same gate the row
  menu uses — rather than a second containment rule.
- No watching. The list is refetched when the cwd changes, like `[Skill ▾]`; a deck added while
  the menu is open appears the next time the cell's directory changes or the tab reloads.
