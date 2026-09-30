---
name: blueprint-from-collection-acceptance
description: "Prove each must-have from the spec works end to end against the local Supabase stack as the user the spec names, and is refused for everyone else."
---

# Must-haves, proven on Supabase

The spec numbers the must-haves. For EACH one, in `test/acceptance.test.ts`, name the test after it
(`must-have 1: …`):

1. Walk the real flow against the local stack through `test/local-stack.ts`, as the kind of user the spec names (a
   fresh signed-in user, an owner, a role): create what it needs, do the action, and read back what that user would
   see.
2. Then the refusal: the same action by someone who must not be able to do it (another signed-in user, a signed-out
   visitor) is refused by the database — a `42501`, or a read that comes back empty.
3. If a must-have does not work yet, make it work — this step is where gaps between the spec and the app close.
4. If a must-have is purely visual, test the screen instead and say so in a comment on the test.

Do not add features that are not must-haves.

Done when the check passes: `test/acceptance.test.ts` exists, and against a fresh local database `yarn build` and
`yarn test` succeed.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Do not run `git init`: a new repository loses the folder's trust and the next unattended step stops at Claude
  Code's trust prompt. The user adds git themselves after the build if they want it.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
