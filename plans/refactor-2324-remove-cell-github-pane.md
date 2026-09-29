# refactor: remove the cell's GitHub pane (#2324)

Part of the #2311 consolidation, "one visible entry per action": the GitHub pane beside an
enlarged cell showed the same PR and issue list as the toolbar's full-screen Pull requests view.

## Removed

- The cell header's `merge` button, the `toggle-github` event and the `github` right pane.
- What only that pane used: `GithubPane`'s `cwd` / `expanded` / `canExpand`, the block that led
  with the cell's own repository, the widen-over-the-terminal button, `common/githubPaneOrder.ts`,
  and the `hideHeading` prop of `GithubPrRepo` / `GithubIssueRepo` (only that block hid headings).

## What goes with it (agreed in #2311's follow-up)

- Reading PRs beside the terminal.
- The cell's own repository leading the list.

## Migration

The per-cell pane is restored from localStorage through `isRightPane`, which derives from
`RIGHT_PANES`. With `github` gone from the list, a stored `github` is dropped on read and the cell
opens with no pane; `gridCell.spec.ts` pins that.
