# fix: preview hands a public page only the published rows of a readPublished collection (#2861)

The preview reads datasets with the author's credentials, which see every row. For a
`public.readPublished` collection production hands the public page only `where(publishField == true)`.

- `RequestedCollection.publishedField`, set by `publicRequests` from `config.readPublished[cid]`
- `visibleRows(want, rows, who)`: published filter → own filter → cap, the order of production's
  query (`where` before `orderBy` + `limit`). Both the one-shot read and the listener (`rowsFor`) use it
- The read cache key includes the field
- Row tests moved to `test/server/backends/sharedAppPreviewRows.spec.ts` (max-lines)

Verification: removing each part (the request field, the filter, `=== true`, filter-before-cap, the
listener path) fails a test.
