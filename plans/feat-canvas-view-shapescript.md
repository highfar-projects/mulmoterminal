# feat: ShapeScript files open in the Files pane's Canvas view (#3016)

`canvasCardForFile` answers a `.shape` path (the package's own `isPresentableShapePath`) with
`{ toolName: presentShapeScript, data: { script: "", filePath } }`. The View loads the model itself
(`loadShape` on `filePath`, through the existing dispatch route with `byPath`), the same shape as the
html card, and it already refreshes on the `plugin:shapescript:file:<path>` channel.

Reach: the Files pane's Canvas button and the row's "Open in the Canvas" (both ask `canOpenInCanvas`).
The Mulmo menu and the deck route also call the card helpers, but only with decks (`.json`), so they
are unchanged.

Not included: CSV (no plugin renders a path to it) and `.chart.json` (the chart View takes inline
data and has no save path from a file).
