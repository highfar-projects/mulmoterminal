# The document packs in English (#2634)

On an English screen the new-build form showed the document packs in Japanese: their names, questions, options,
steps and examples. The checks compare the answers' values as written (for example
`KEEP = "このフォルダの FAQ.md に書き足す"`), so translating the pack files in place would break them.

- A pack may carry `locales/en.json`: words for its title, each question (label, why, and each option by its value),
  each step and each example (`packLocaleSchema` in `common/blueprint/packLocale.ts`). Only words: an option keeps its
  value, and the form shows `optionLabels[value]` for it. So what is recorded and checked is unchanged.
- The pack routes take `?lang=` (the screen's language) and lay the overlay over what they return
  (`server/blueprint/packLocales.ts`); a Japanese screen, or a pack without an overlay, sees the pack as written. Every
  language other than Japanese reads English. A broken overlay is shown as written rather than hiding the packs, and
  `packProblems` refuses it on install.
- The document base and all ten document usecases have an overlay; a spec holds each one to cover its pack exactly
  (every question, option, step and example, nothing stale), and the list of document packs is pinned.

Not in this change: the app-building packs, and the run view (a build's step titles are stored with the run).
