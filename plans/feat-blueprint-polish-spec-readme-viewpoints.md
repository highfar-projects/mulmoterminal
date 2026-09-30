# polish reads specifications and READMEs for what their readers need (#2778)

「仕様書」 (technical/spec) and 「README・技術文書」 (technical/readme) were the kinds with no viewpoints. They now have:

- spec: `measurable-requirement` (a requirement written in words that cannot be measured — 適切に, 速やかに, 十分な)
  and `failure-behaviour` (what happens on failure or input it cannot take);
- readme: `prerequisites-stated` (shared with manuals), `first-run` (how to install and the first command, written
  out) and `result-check` (shared with manuals).

All are the writer's to settle. The catalog spec pins each genre's list; the polish check's "a kind with no
viewpoints" case now uses 「指定しない（chaff に任せる）」, the one kind left without any.

Real builds on a self-written README and an API spec (not shipped as examples) turned the planted gaps into writer
questions — prerequisites and the first command for the README (its result check was judged present: `shelf list`),
the unmeasurable 「速やかに」「適切なタイミング」 and the missing error behaviour for the spec — and changed no text.
