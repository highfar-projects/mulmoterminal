# fix: the Files pane says a directory is empty before it has read it (#2148)

## The defect

`roots` carries two different facts in one value:

```ts
const roots = ref<Node[]>([]);   // mount: nothing read yet
```

```html
<p v-if="treeError">{{ treeError }}</p>
<p v-else-if="roots.length === 0">Empty directory.</p>
```

An empty array is both *"no listing has come back"* and *"the listing came back with nothing in
it"*, and the template renders the second over the first. So for the whole of the root `/list`
round trip the pane asserts a fact it has not learned — and a user cannot tell a slow read from a
wrong directory from a dead server.

`reload()` reopens the same window on every re-root, because `teardown()` sets `roots` back to `[]`
— which is what makes it show up while walking the zoom between cells, not only at mount.

Note what is already modelled correctly: `treeError` is its own state. Only "not read yet" is
missing.

## The change

`roots` becomes `Node[] | null`, and `null` is the missing state — "no listing has come back for
this root". The empty array then means one thing only: the directory is empty.

- `loadRoot()` needs no new line: assigning the listing IS the transition out of "not read".
- `teardown()` sets `null` rather than `[]`, because the root is changing and nothing has been read
  for the new one. That is the half of the bug that shows up while walking the zoom.
- The header's **Reload tree** button does NOT go through `teardown()`, so a manual refresh keeps
  the tree on screen and swaps the result in. Flipping to "Loading…" there would throw away a
  correct tree to show a spinner.
- The four readers take `roots.value ?? []`, which is not a null-check apology: an unread tree
  really does hold no rows, no node at a path, and no expanded paths.

`Loading…` is what the other panes in this repo say (`PromptsPane`, `TranscriptPane`,
`WikiBrowseOverlay`, `GithubPane`), so this is the same string in the same muted style rather than
a new vocabulary.

## Why not a second ref beside `roots`

A `treeLoaded` boolean was written first and thrown away. It works, but it is a second thing that
has to be kept in step with the first — the same shape as the bug being fixed, one value's meaning
depending on another's. `null` cannot drift from `roots` because it IS `roots`.

It also costs less: the boolean version pushed `FilesPane.vue` over the repo's 600-line
`max-lines` cap, which is worth saying out loud — **this file is at the cap either way**. The next
change to it has to take something out. The candidate is the row menu (`openRowMenu`,
`runRowAction`, `onMenuNav`, the click-away and focus handling, and its `<Teleport>` markup), which
is about 125 lines, has a component boundary that already exists in `filesRowActions.ts`, and has
its own spec driving it through the pane — so the lift would be provable rather than argued. It is
not done here because it is a refactor and this is a bug fix.

## Tests

`test/src/components/filesPaneTreeLoading.spec.ts` — its own file rather than growing
`FilesPane.spec.ts`, which is already near the repo's `max-lines` cap.

The cases are the three states and the transition between them, both directions: in flight says
Loading and NOT Empty; an empty listing says Empty and NOT Loading; a non-empty listing says
neither; and a re-root through `reload()` goes back to Loading rather than to Empty.
