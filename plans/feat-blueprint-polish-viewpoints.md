# feat: polish reads a document for what its kind needs (#2643, stage 2)

Stage 1 measured a document as its kind with chaff's genre. chaff's business rules are mostly experimental, so a
padded report measured as `business/report` came back clean (isamu/lab#290). What a report, a proposal or a blog
post needs beyond chaff's findings is a matter of reading: this stage gives the polish step a list of what to read
for, and makes the reading leave a record a machine can check.

## Change

- `blueprints/polish/viewpoints.json`: a catalog of viewpoints (conclusion first, who and by when on a request,
  a number's source, stacked hedging, a passive with no actor, a filler opening, a stock closing, a conclusion
  that only repeats, a title the body does not keep, a section with nothing concrete, …), each with what to look
  for and whether the polish may fix it (`may`) or it is the writer's (`writer`); and, per genre, which apply.
  The starting point is §7 and §8 of `business-blog-harness-spec.md` in isamu/lab. Manuals and specs have none yet.
- The polish step records each of the kind's viewpoints for every polished file in `.blueprint/viewpoints.json`:
  `ok`, `fixed` (only for `may`, quoting the original text, which must be gone) or `writer` (quoting the place,
  with the question in `note`). A fix that would add a fact — who, by when, a source, a missing section — or move a
  heading is always the writer's; nothing is guessed into the document.
- `checks/viewpoints.mjs` holds the rules; `progress` / `verify` refuse a missing, doubled or unknown viewpoint, a
  `fixed` the catalog does not allow, and a quotation that is not where it says. The report must carry
  `## 書いた人に確かめてほしいこと` / `## For the writer` with every `writer` quotation.
- A kind with viewpoints is read whether or not chaff found anything, so the survey chooses every named document
  (up to `maxFiles`), and an empty list is refused while one is left.

`--experimental` is not turned on for the business kinds: it brings the reading closer to chaff's rules, but also
their known false reports (`latin-spacing` on 「9月」). The judgement stays in the viewpoints, tied to quotations.
