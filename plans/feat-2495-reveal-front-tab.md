# feat: the Files tree follows the tab in front (#2495)

When the tab in front changes — a tab clicked, a tab key, a Preview link, the palette, a path clicked
in the terminal — the tree opens that file's folders and brings its row into view, as VS Code's
explorer follows the active editor.

## Shape

- `useFilesReveal.showInTree(path)`: expand the ancestors outermost first, then `scrollIntoView`
  with `block: "nearest"`, so a row already on screen (the one just clicked) does not move. It opens
  nothing. The folder walk is shared with `revealPath` (`expandTo`).
- It keeps its OWN generation count. A reveal (the finder, a search result) brings its file to the
  front; with one shared count every reveal would cancel itself at that moment, and the search
  panel's jump to a line — which waits on the reveal's answer — would never land. The existing
  search spec goes red under a shared count.
- `FilesPane` watches the front path and calls it only once the remembered pane is restored: until
  then the tree is being put back where the reader left it (expanded folders and scroll, #2156), and
  following the front tab would move it.
