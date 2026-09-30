---
name: blueprint-from-collection-actions
description: "Build the source's actions and ingests the spec decided to build, and write down the ones left to a person."
---

# Actions and ingests, as features

Read `.blueprint/actions.json` (written with the spec, and agreed when the spec was approved). If it does not exist, the
source had no actions or ingests: stop. Each entry names an action (`books.actions.tidy`) or an ingest (`books.ingest`),
what it was (`kind`) and what was decided (`decision`). The original instructions are in
`.blueprint/source/collections/<slug>/templates/`.

For every `feature` (one an earlier step already built, because a must-have needed it, is checked against its entry and
given its test here, not built a second time):

- **mutate** — an API operation and a button on the record's screen. Its `require` is checked at the API's entry; its
  `set` is the change it makes; its `params` are the inputs the button asks for.
- **chat / agent** — read the template: it says what the agent was asked to do. Build that as the app's own logic.
  Where a step genuinely needs a language model (summarising, classifying, drafting text), call the Claude API from the
  server (`@anthropic-ai/sdk`, the model id in `.env` with a sensible default, `ANTHROPIC_API_KEY` in `.env`). Before
  anything goes in `.env`, make sure `.gitignore` has a line `.env` — add it if not; the check fails otherwise. Never
  write the key's value yourself: tell the person, in the README, to put their own key there. Everything that does not need a model stays plain code. The screen shows the result and any
  failure in words.
- **ingest** (rss / atom / http-json) — a job that fetches the source, maps each item as the ingest's `map` says, and
  inserts or updates records by the `idFrom` it names, never duplicating. Run it on the schedule the ingest declares,
  inside the server, and also from `yarn ingest <slug>`. An ingest of kind `agent` is built like an agent action.

Tests in `test/actions.test.ts`, one per `feature`, each with the entry's `name` in the title of its `it(…)` / `test(…)`
(`it("books.actions.tidy: summarises", …)`) — with `it` / `test` imported from `vitest` in that file (`import { it } from "vitest"`); the check reads titles only from
calls to those imports, so a global `it`, a helper of the same name, a comment or a title built at run time does not count:
walk the real flow against a temporary database and read back what changed. Never call the network in a test: a model
call goes through a client the test replaces with a stand-in, and an ingest reads a fixture file kept under
`test/fixtures/`. The tests must pass with no API key set.

For every `manual`: a section in `README.md` whose heading names the entry (`## books.actions.tidy`) and which says,
step by step, what a person does instead. For every `drop`: nothing to build; the spec already says why.

Done when the check passes: `.blueprint/actions.json` matches the source, every `feature` has a test titled with its
name, every `manual` has a README heading naming it, an `.env` (if any) is ignored, and `yarn build` and `yarn test`
succeed.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Do not run `git init`: a new repository loses the folder's trust and the next unattended step stops at Claude
  Code's trust prompt. The user adds git themselves after the build if they want it.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
