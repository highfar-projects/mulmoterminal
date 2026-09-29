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

- **An agent this machine cannot start is offered disabled.** The start-up gate requires the declared
  default (`bin/default-agent.js`), so saving an uninstalled one would stop the next launch. The rule
  is `defaultAgentChoices` (pure, specced). A failed availability fetch leaves every agent enabled,
  as the launch form does.
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
