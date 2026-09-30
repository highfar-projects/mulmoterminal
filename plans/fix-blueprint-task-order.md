# Document tasks listed most-used first (#2786)

The new-build form listed the document tasks by slug (adopt, ask, compare, …), so it opened on 「文書のフォルダに chaff
を入れる」 — the task used least. Each shipped document task's manifest now has an `order` (the existing field; only a
built-in pack's counts): polish, review, verify, ask, summarize, compare, write, style, glossary, adopt.

The form opens on 「文書を整える」, and the examples, which follow the packs' order, start with polish's too.
`docTaskOrder.spec.ts` pins the shipped order against the real packs.
