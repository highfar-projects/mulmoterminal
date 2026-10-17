# The Files pane carries Preview / Canvas to the next file, per session (#3075)

## Problem

In the pane beside a cell, a Markdown file in Preview or in the Canvas view goes back to the editor
when another file is opened. Each file keeps its own view: Preview is dropped on every load unless the
path has a tab remembering it, and the Canvas view is a set of paths. So reading several documents
means switching the view again for every file.

## Decided (with the user)

- The view last chosen in the pane is remembered per session (the cell's session id), and a newly
  opened file inherits it when the file has that view. If it does not (Canvas on a `.ts`), the file
  opens on its editor and the view stays for the next file.
- A file's own memory wins: a tab that remembers its view, or a path still in the Canvas view.
- The memory survives a reload: it is kept in localStorage per session id.
- Unchanged:
  - a terminal path with a line number still opens on the editor and does not change the memory;
  - the full-screen `/files` view has no session and keeps today's behaviour.

## Shape

- `src/components/filesViewMode.ts` (pure):
  - `viewModeOf`: the view on screen;
  - `inheritedView`: what a file with no memory of its own opens in;
  - the per-session store (parse, read, write), capped and newest first.
- `src/composables/useSessionViewMode.ts`:
  - the store in localStorage (best effort);
  - `useCarriedView`: the inheritance handed to the tabs, and `choose`, which records only the
    reader's own toggles.
- `useFilesTabs.open` asks for the carried view only when the file has no tab and the caller asked
  nothing (`fresh`). Preview goes through the load's remembered-view path, so it is applied only when
  the file has a Preview. The Canvas view goes up after the file is in front, only where the pane has
  one and the file can show it.
- Callers that say how a file comes up pass `fresh` and so are not affected:
  - a located open (terminal `path:line`);
  - a preview link;
  - an agent's `showFile` (now opening on the editor before setting the asked-for view);
  - a file just created.
- `TerminalGrid` passes the cell's session id as `viewModeSession`.

## Out of scope

- Side by side.
- The full-screen view.
- A view per file type.
