# feat: question-box template

- `templates/question-box.md`: anonymous questions (`idFrom: "auto"`), `public.readPublished` +
  `publishField: "published"`, a public page (ask + read the published Q&A) and a member desk
  (answer via `correct` + `transition`, live). Publishing is the owner's switch on
  `/m/{slug}/records/questions` — never a page write, since `correct` sends strings
- Registered in `skillTemplates.spec.ts` (deploys as written); pages run in
  `test/src/skillTemplateQuestionBox.spec.ts`
- Listed in SKILL.md and in `docs/guide/{en,ja}/shared-apps.md`
- Merge after #2863 (the preview's published-only filter), which the template's text relies on
