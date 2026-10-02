# feat: per-app pseudonym ids in MulmoTerminal (receptron/mulmoserver#325)

`@receptron/sharedapp@0.39.0` adds `idFrom: "pseudonym"` / `"pseudonym+field"` — the id is
sha256(uid + ":" + aid), so a public row cannot be joined to the same person's rows in another app.
MulmoServer's rules and client accept it (receptron/mulmoserver#326, #327). This host must write,
find and own those rows the same way:

- writes: participant submit, preview submission — `idOwnerOf` → `recordId`
- own rows: preview `ownsRow` / `visibleRows` (reader carries the pseudonym, `readerFor`),
  `ownRequests` (`ownDocId: "pseudonym"`, composite `ownIdFrom: "pseudonym"`), preview lookup,
  participant `ownSelector` (the joined app carries the reader's pseudonym)
- template test: article templates declare `APP_PROTOCOL_ARTICLE` (2.0.0); `APP_PROTOCOL` is 3.0.0

Templates and SKILL.md switch to the pseudonym strategies in a separate change.
