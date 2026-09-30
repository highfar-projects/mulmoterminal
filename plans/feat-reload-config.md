# feat: read config.json again without a restart (#2627)

Part of #2616.

## What

- `POST /api/config/reload` (`server/config/config-reload.ts`) reads `~/.mulmoterminal/config.json`
  under the config lock and adopts it the way a save is adopted: the directory watchers and the
  scheduler's system tasks are told what moved (`notifySavedChanges`), and a changed `accounts` list
  installs the bundled skills.
- It refuses, keeping the running config, when the file does not parse or when its `keymap` has an
  entry that would stop the server from starting (the boot check, `checkKeymap`, on the raw file).
  The 409 says why and lists the keymap entries.
- Settings shows **Reload config file** under the version row. On success the page reloads, so every
  screen reads the config the one way it already does rather than a second path that could miss one.

## Decisions

- **The decision is pure** (`decideReload`): corrupt → refuse; fatal keymap → refuse; missing → adopt
  the empty config a start would run on; otherwise adopt.
- **The page reloads rather than re-hydrating in place.** The shell's loader owns the per-caller refs
  (presets, default cwd), and a second hydration path would be one more place for a setting to be
  missed. Unsaved editor buffers flush on the way out, as on any reload.
- **Other open tabs are not told.** They pick the file up on their next reload.
- **Still needs a restart:** a provider key (it lives in the environment) and the session-sweep
  cadence (the second half of #2626). A saved directory added by the reload reaches the collection
  watchers and the scheduler, but not MulmoScript's story roots, which are captured once at boot —
  the same as a directory saved from Settings today, so not a gap the reload opens.
- **Settings copy said two things took effect "on the next server start"** — the GitLab hosts and
  the built-in scheduled tasks. Both apply at once when saved from Settings (the tasks since #2645),
  so the copy says that now, in all five languages.

## Verification

- Specs: `config-reload.spec.ts` (the decision, and the route: adopt + notify, notify nobody when
  nothing moved, accounts install skills, a broken file and a fatal keymap keep the running config),
  `ConfigReloadButton.spec.ts`. Each decision was inverted and the specs went red.
