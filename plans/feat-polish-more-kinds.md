# Polish and adopt offer every kind of document chaff measures (#2852)

Polish offered only some of the genres chaffjs 0.18 measures. It now offers every one — FAQ, glossary, court judgment,
patent specification, academic paper, novel or story, literary essay, poetry, play or script, speech, transcript — and
adopt offers the ones it lacked (blog essay, email, judgment, patent, the literature and speech genres).

A kind is a genre plus viewpoints: what a reader of that kind needs that chaff cannot measure. Each new kind gets them
in `viewpoints.json`, all `writer` (what needs adding is a question for the author, never written in):

- FAQ: the answer in the first sentence; one question per entry.
- Glossary: no definition that uses its own term; one name for one thing.
- Judgment: the decision findable at the top; one name for one thing.
- Patent: claim terms explained in the description; reference numerals that agree; one name for one thing.
- Paper: the contribution stated; abstract and conclusion agree; plus unsourced numbers and stacked hedging.
- Fiction: point of view, tense, who speaks each line. Play: who speaks; stage directions set apart.
- Literary essay: the blog essay's padded intro, stock closing, title against body.
- Speech: the main point at the start and the end; plus stock closing and unsourced numbers.
- Transcript: every turn names its speaker.
- Poetry: none — chaff's own measures only; how a poem reads is not made a rule.

`polishKind.spec.ts` now pins that polish offers every genre chaff has.
