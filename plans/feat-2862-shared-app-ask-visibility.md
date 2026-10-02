# The shared-app skill asks whether visitors see what was sent (#2862)

Whether a public page shows the records people send is a declaration the page is built on, so the skill asks it
up front, as a fourth question in "Before you ask the user a question".

- Three choices, in the author's words: nobody sees it (neither `public.read` nor `public.readPublished`), only the
  ones I choose (`collections[cid].publishField` + `public.readPublished`, switched per row at `/m/{slug}`), everyone
  sees everything (`public.read`, no `emailField`). "Only a summary" is said to have no mechanism yet.
- What publish refuses, and that a public agent can watch only `public.read`, are stated as sharedapp 0.37.0 has them.
- Step 2c said a public page's data is limited to `public.read`; it now names the published rows of `readPublished`
  too.
- `sharedAppSkill.spec.ts` puts the three choices and each listed refusal through `parseAuthoredApp` +
  `publishProblems`, each refusal asserted by its own reason, so the prose fails as a test when the gate moves.

Not here: the share card (`/s/`, not built), the question-box template (with #2861).
