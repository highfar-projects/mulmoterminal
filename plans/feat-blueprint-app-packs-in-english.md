# The app packs in English (#2634)

#2838 gave the document packs English overlays; this gives the rest — the app usecases (product, from-collection,
internal, refactor) and the app bases (local, firebase, cloudflare, supabase, repo) — so every shipped pack shows its
words in English on a non-Japanese screen. The spec now requires an overlay for every shipped pack.

A usecase may write one step id once per base, with different words for each (from-collection's `import` is
"記録を移す（エミュレータ）" on Firebase and describes D1, Postgres or Firestore by base). An overlay can key such a step
`<id>@<base>`; the form takes the words for the build's base before the id's own (`localizedSteps(…, baseSlug)`). When
the pack's versions of an id differ, `overlayProblems` requires words for each base; when they say the same thing, one
entry for the id is enough.

Not in this change: the run view and the run list (a build stores its step titles when it starts).
