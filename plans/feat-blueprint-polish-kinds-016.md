# Polish offers chaff 0.16's kinds of document (#2732)

chaffjs 0.16 added the `legal/*` and `docs/*` genres. Polish still put 「仕様書・規程・契約書」 on `technical/spec`
and 「手順書・README」 on `technical/readme`, so a contract was measured as a specification.

## Kinds

The two combined kinds are split, and nothing else is added — each new option is one a person would otherwise have
had to squeeze into the old combined one (fewer, clearer choices; FAQ, glossary, paper, literature and speech are
left out until someone polishes one):

| option | genre |
|---|---|
| マニュアル・手順書 | docs/manual |
| README・技術文書 | technical/readme |
| 仕様書 | technical/spec |
| 契約書・利用規約 | legal/contract |
| 規程・社内規則 | legal/statute |

## Viewpoints

`legal/contract` already turns on chaff's structure checks (missing articles, numbering, doubly defined terms), so
the viewpoints are what only a reader sees, and all are the writer's to settle (each needs a fact added):

- contract: duty-owner-deadline, breach-consequence, exception-with-rule
- statute: scope-stated plus the three above
- manual: prerequisites-stated, steps-one-action, result-check

`technical/spec` and `technical/readme` keep no viewpoints.

## Compatibility

A build started before this with 「手順書・README」 or 「仕様書・規程・契約書」 finds no genre for it when it resumes
(`genreOf` returns null) and is measured with chaff's defaults — the same as 「指定しない」, never a failed run.
