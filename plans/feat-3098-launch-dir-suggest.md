# feat: suggest subdirectories in the launch form's Working directory field, and refuse a missing one (#3098)

## What the user asked for

- When typing in the Working directory field pauses for 1s or more, suggest directories.
- A path that does not exist must not be launchable.

Decided with the user:

- Suggestions are **subdirectories**, as a shell's Tab completion: open the parent of what is
  typed and list the children whose name starts with the last segment.
- ArrowUp / ArrowDown move, Tab or a click accepts. Accepting fills the field with the path plus a
  trailing `/` and immediately asks for the next level. Esc closes. Enter still launches, unless a
  suggestion is highlighted, in which case it accepts it.
- A missing directory disables the play button and Enter, with a reason under the field.

## What is already there

The server already refuses a fresh spawn in a missing directory: `existingWorkspace`
(`server/config/workspace.ts`) feeds `refuseUnusableWorkspace` (`server/routes/ws-routes.ts`),
which sends an error frame and closes. The refusal arrives only AFTER the cell has connected, so
the form itself never said anything. The server side is left as it is; this change is the form.

No route lists the subdirectories of an arbitrary path: `/api/files/browse/list` silently answers
the default workspace for a `cwd` that does not exist, which is the wrong answer for "is this here".

## Design

- `common/dirSuggest.ts` — the route path, the wire shape `{ exists, suggestions }`, its guard.
- `server/files/dirSuggestion.ts` — pure: split what was typed into the parent to read and the
  name prefix to match (`~` expanded like `existingWorkspace` does), and pick the matching names
  (case-insensitive prefix, hidden only when the prefix starts with `.`, the exact name itself
  left out, sorted, capped). Directory reading is injected.
- `server/files/dir-suggest-route.ts` — `GET /api/dir-suggest?path=`. `exists` is
  `existingWorkspace(path) !== null`, the same rule the spawn uses, so the form and the server
  cannot disagree about whether a path is launchable.
  - Suggestions keep the user's own spelling (`~/ss/ll` → `~/ss/llm`).
  - A GET with no origin guard, like `/api/files/browse/list`, which already lists any directory.
- `src/composables/useDirSuggest.ts` — the 1s idle timer, a request token so a superseded answer
  never lands, and `confirmExists(path)` so an Enter pressed before the timer fires is still
  checked. A failed read is "unknown", which does not block: the server still refuses.
- `src/components/dirSuggestKeys.ts` — pure key → action mapping for the list.
- `CellLaunchForm.vue` — the listbox under the field, the disabled play button, the message.

## Left out

- A preset chip's one-click launch is not pre-checked. A chip for a deleted directory is still
  refused by the server as it is today.
