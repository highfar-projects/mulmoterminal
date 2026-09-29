---
name: blueprint-from-collection-actions
description: "Build the source's actions and ingests the spec decided to build as Worker features, and write down the ones left to a person."
---

# Actions and ingests, as features

Read `.blueprint/actions.json` (written with the spec, and agreed when the spec was approved). If it does not exist, the
source had no actions or ingests: stop. Each entry names an action (`books.actions.tidy`) or an ingest (`books.ingest`),
what it was (`kind`) and what was decided (`decision`). The original instructions are in
`.blueprint/source/collections/<slug>/templates/`.

For every `feature`:

- **mutate** — an API operation in the Worker and a button on the record's screen. Its `require` is checked at the
  API's entry; its `set` is the change it makes; its `params` are the inputs the button asks for.
- **chat / agent** — read the template: it says what the agent was asked to do. Build that as the app's own logic.
  Where a step genuinely needs a language model (summarising, classifying, drafting text), call the Claude API from the
  Worker (`@anthropic-ai/sdk` runs there), with the model id in a `vars` entry of `wrangler.jsonc` and the key as the
  secret `ANTHROPIC_API_KEY`: locally in `.dev.vars`, in production set by the person with
  `yarn wrangler secret put ANTHROPIC_API_KEY`. Before anything goes in `.dev.vars`, make sure `.gitignore` has a line
  `.dev.vars` — add it if not; the check fails otherwise. Never write the key's value yourself: tell the person, in
  the README, where to put their own key. Everything that does not need a model stays plain code. The screen shows the
  result and any failure in words.
- **ingest** (rss / atom / http-json) — a job that fetches the source, maps each item as the ingest's `map` says, and
  inserts or updates records by the `idFrom` it names, never duplicating. Run it from a Cron Trigger
  (`"triggers": { "crons": [...] }` in `wrangler.jsonc`, and a `scheduled` handler in the Worker) on the schedule the
  ingest declares; say in the README how to run it once by hand (`yarn wrangler dev --test-scheduled`, then open
  `/__scheduled`). An ingest of kind `agent` is built like an agent action.

Tests in `test/actions.test.ts`, one per `feature`, each with the entry's `name` in the title of its `it(…)` / `test(…)`
(`it("books.actions.tidy: summarises", …)`) — with `it` / `test` imported from `vitest` in that file (`import { it } from "vitest"`); the check reads titles only from
calls to those imports, so a global `it`, a helper of the same name, a comment or a title built at run time does not count:
walk the real flow through the Worker on the test D1 and read back what changed. Never call the network in a test: a
model call goes through a client the test replaces with a stand-in, and an ingest job takes the fetch it uses as an
argument, so the test hands it a fixture instead. The tests must pass with no API key set.

For every `manual`: a section in `README.md` whose heading names the entry (`## books.actions.tidy`) and which says,
step by step, what a person does instead. For every `drop`: nothing to build; the spec already says why.

Done when the check passes: `.blueprint/actions.json` matches the source, every `feature` has a test titled with its
name, every `manual` has a README heading naming it, a `.dev.vars` (if any) is ignored, and `yarn build` and
`yarn test` succeed.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Do not run `git init`: a new repository loses the folder's trust and the next unattended step stops at Claude
  Code's trust prompt. The user adds git themselves after the build if they want it.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
