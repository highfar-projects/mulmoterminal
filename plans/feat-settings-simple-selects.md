# feat: default agent, header status tint and playful effects in Settings (#2617)

Part of #2616 (settings without talking to an agent).

## What

Three global keys that only a skill could write get a Settings control:

| Key | Where | Control |
|---|---|---|
| `defaultAgent` | Models | select: "not set (Claude)" + the built-in agents |
| `headerStatusTint` | Header buttons and chips | select over `HEADER_STATUS_TINTS` |
| `playfulEffects` | Theme | on/off checkbox |

Each saves through `POST /api/config` (`postConfigField`) and puts the control back when the save is
refused. No server change: the merge already accepts all three.

## Decisions

- **An agent is pickable only once the server has positively said it can start it.** The start-up
  gate requires the declared default (`bin/default-agent.js`), and "not set" declares claude, so a
  wrong pick stops the next launch. While the availability answer is loading or after it failed,
  only the current value is enabled; "not set" is disabled when claude is not confirmed. The launch
  form keeps the opposite reading (unknown = available), because a wrong guess there fails one spawn.
  `useAgentAvailability` exposes both (`unavailableAgents`, `confirmedAgents`); the rule is
  `defaultAgentChoices` (pure, specced).
- **Each control is locked while its save is in flight**, so an earlier pick's answer cannot land
  after a later one.
- **`--agent` wins for this run.** The POST echo is the effective value; when it differs from the
  pick, the section says the file took it but this run follows the flag.
- **playfulEffects is on/off only**, so Settings does not list the pictures (the config skill keeps
  them unexplained). Off forgets a picture chosen in the file; on comes back as `random`
  (`playfulSwitch`, pure, specced).
- **headerStatusTint sits with the header section**, not "Grid header read-outs" as the issue said:
  it is about a terminal's own header, which is what that section covers.
- These reverse two recorded decisions in `settings-coverage.spec.ts` ("defaultAgent is config-file
  only", "playfulEffects is config-file only on purpose"), on the umbrella's direction.

## Verification

- Specs: `defaultAgentChoices`, `playfulSwitch`, `settingsSelects` (save + refused-save revert for all
  three, the `--agent` note). Each decision was inverted and the specs went red.
- A real server with a scratch HOME: each control writes config.json and applies without reload.

## i18n files

`en.ts` and `ja.ts` sat at the file-length limit, so the new strings are their own section
(`src/i18n/settingsControls/`) and `fileHistory` moved out to `src/i18n/fileHistory/` beside it,
the way `focusMode` did. Every locale's flattened messages were compared against main: nothing
changed or went missing, and the only additions are under `settingsControls`. The later children of
#2616 can add their strings to `settingsControls` without touching the big files.
