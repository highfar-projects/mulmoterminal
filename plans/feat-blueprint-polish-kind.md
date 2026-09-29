# feat: polish measures a document as the kind the person names (#2643, stage 1)

Part 5 of #2641 is "polish by the kind of document". This first stage only changes the machine's measure.

## Change

- `blueprints/polish/kinds.json`: the kinds offered (blog, essay, owned media, report, proposal, email, press
  release, meeting notes, manual/README, spec/regulation/contract), each with the chaff genre it is measured by;
  「指定しない（chaff に任せる）」 has none and is the default.
- The interview asks 「どんな文書ですか」 when the style is chaff's own. A folder's own style already names its
  genre in `chaff.yaml`, and `--genre` would win over it, so the kind is not asked then.
- `checks/kind.mjs` turns the answers into chaff's `--genre` argument. The survey's count, the progress and verify
  checks, and the drafts to chaff (`drafts.mjs` gains an `extra` argument) all measure with it, and the survey and
  polish skills tell the agent to run chaff the same way.
- Nothing is written into the person's folder: no `chaff.yaml` is shipped.

## Found on the way

A sample report measured as `business/report` gets no finding without `--experimental`, and a date's 「9月」 is
counted by `latin-spacing` — both reported to chaff as isamu/lab#290. Whether polish should run the business kinds
with experimental rules is left to stage 2, with the per-kind viewpoints.
