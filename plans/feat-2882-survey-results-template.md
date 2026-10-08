# feat: survey-results template — a survey whose choice totals are public (#2882)

A new template beside `survey.md`, which stays as it is (results owner-only by default). Built on
the `tally.md` shape with no new key: the choice answers live in `tallies` (`public.read`,
`answers` + `status` only), the address, name, free text and answer time in `responses`
(private, `emailField`), both `idFrom: "pseudonym"` so they join by id. `protocol: "3.0.0"`.

- One write per press: `tallies` first, then `responses` as a second press. A failed `responses`
  re-sends only `responses`
- `tallies.answers` is free text the rules never inspect, so the public page counts only declared
  question ids and declared choices, and never draws a string it read from a tally (broken JSON is
  counted as "unreadable", by number only)
- Results are shown only after this visitor answered (`viewer.mine` / `view.mine`), so seeing them
  does not steer the answer. Showing them to non-respondents is left out
- No `views[].limit` (it would undercount); scaling past roughly ten thousand: receptron/mulmoserver#324
- The owner's desk counts the union of declared and stored values (as `survey.md`) and lists each
  person by joining `tallies` and `responses` on id
- Tests: the template deploys as written; its public collection carries only `answers` + `status`;
  a jsdom spec runs both pages (order, payloads, counting, unknown strings never drawn)
- SKILL.md template list, both guides' tables, and a one-line pointer at the top of `survey.md`
