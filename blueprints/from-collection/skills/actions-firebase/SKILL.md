---
name: blueprint-from-collection-actions
description: "Build the source's actions and ingests the spec decided to build, on Firebase, and write down the ones left to a person."
---

# Actions and ingests, as features (Firebase)

Read `.blueprint/actions.json` (written with the spec, and agreed when the spec was approved). If it does not exist, the
source had no actions or ingests: stop. Each entry names an action (`books.actions.tidy`) or an ingest (`books.ingest`),
what it was (`kind`) and what was decided (`decision`). The original instructions are in
`.blueprint/source/collections/<slug>/templates/`.

For every `feature`, build it as below, unless an earlier step already built it because a must-have needed it: then
check it against its entry and give it its test here instead of building it a second time.

- **mutate** — a button on the record's screen that makes the change its `set` names. Its `require` is enforced by the
  security rules (or a callable function when the rules cannot express it), not only by the screen.
- **chat / agent** — read the template: it says what the agent was asked to do. Build that as the app's own logic. A
  step that genuinely needs a language model is a callable Cloud Function (`onCall({ enforceAppCheck: true }, …)`) that
  calls the Claude API with `@anthropic-ai/sdk`; the key is a Secret Manager secret (`defineSecret("ANTHROPIC_API_KEY")`),
  never in the client or the repository. Never ask for or handle the key's value: if the secret is not set, ask the
  person through the blueprint question tool to run `firebase functions:secrets:set ANTHROPIC_API_KEY` themselves (for
  the dev and the production project), and wait for them.
- **ingest** (rss / atom / http-json) — a scheduled function (`onSchedule`) on the ingest's schedule that fetches the
  source, maps each item as the ingest's `map` says, and writes records by the `idFrom` it names with `set`, never
  duplicating. An ingest of kind `agent` is built like an agent action.

Tests in `test/blueprint/actions.spec.ts`, one per `feature`, each with the entry's `name` in the title of its `it(…)` /
`test(…)` (`it("books.actions.tidy: summarises", …)`) — with `it` / `test` imported from `vitest` in that file (`import { it } from "vitest"`); the check reads titles only from
calls to those imports, so a global `it`, a helper of the same name, a comment or a title built at run time does not count —
against the emulators: do the action as a signed-in user and read back what changed, and check that someone who must not
do it is refused. Never call the network in a test: the model call and the fetch go through clients the test replaces
with stand-ins.

For every `manual`: a section in `README.md` whose heading names the entry (`## books.actions.tidy`) and which says, step
by step, what a person does instead.

Done when the check passes: `.blueprint/actions.json` matches the source, every `feature` has a test titled with its
name, every `manual` has a README heading naming it, and `emulator-test.sh actions` passes.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Do not run `git init`: a new repository loses the folder's trust and the next unattended step stops at Claude
  Code's trust prompt. The user adds git themselves after the build if they want it.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
