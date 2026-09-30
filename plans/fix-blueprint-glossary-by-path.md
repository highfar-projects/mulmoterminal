# glossary gives each kind of document its own genre (#2774)

When glossary creates chaff.yaml it wrote one `genre`, so a policy and its guide were both measured as a policy —
the polish that follows (#2765) said so in its report. chaff 0.16's chaff.yaml has `by_path` (a genre per file or
folder, globs relative to chaff.yaml).

The apply skill now says: when creating the file for documents of different kinds, the kind most of them are goes in
`genre` and each other document gets its own under `by_path`. An existing file's `genre` and `by_path` are the
person's and are kept (the check already refuses a lost line).

A real run of the glossary example wrote `genre: legal/statute` with `by_path` giving tebiki.md `docs/manual`, and
chaff then reads kitei.txt as legal/statute (from chaff.yaml) and tebiki.md as docs/manual (from by_path).
