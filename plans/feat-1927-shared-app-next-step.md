# feat(sharedApp): name what to press at the two places a first run stops (#1927)

## Why

A first shared app stops twice before any work, and neither stop says what to do next:

1. Every shared-app operation without a session refused with "connect remote-host first". The
   toolbar calls it **Remote host**, and its panel describes only the phone's command channel, so
   authors took signing in for a developer-only feature.
2. Turning on a tool group in the launch form changed nothing in the open cell — the registration
   is for the directory and applies to the next start — and nothing said so.

## Change

- `server/backends/sharedApp/signInStep.ts`: one `SIGN_IN_STEP` sentence naming the control and the
  button, used by all five refusals (init, fork, unpublish, the shared context, participate).
- `CellLaunchForm.vue`: a line under the tool-group switches, in five languages: it takes effect for
  the next terminal started in the directory; restart an open cell.

## Left out

The skill text: the refusal reaches the agent directly, which covers clients that never read the skill.
