# refactor: group server/config into subdirectories (#2946)

Second of a series after `server/agents` (#2944): `config` -> `backends` -> `session` -> `infra`,
one directory per PR. Same method and same constraint: files are moved with `git mv`, never renamed
or edited; only import specifiers and path mentions change. `test/server/config/` mirrors the split.

## Layout

- `header/` — header buttons and chips: config, context, resolve, title, entry changes, routes.
- `dir/` — per-directory settings: dir-config (read, edit, write), icon, background, file, `cwd-presets`,
  `hue-rotate`, `repo-json`.
- `worktree/` — worktree env, task and per-worktree dir config.
- `keymap/` — keymap binding route and check.
- `agent/` — agent binaries, entry routes, argv parsing.
- Root keeps what several features read: `app-config`, `config-*`, `env`, `workspace`, `on-disk-entry`,
  `launch-options`, `port-from-argv`, `sound-presets`, `system-task-settings`, `theme-entry-routes`,
  `update-status`. `update-status` resolves `package.json` from its own URL, so it stays put.

Specs that name no single module (`add-dirs`, `custom-themes`, `settings-coverage`, ...) stay at the
root of `test/server/config/`.

## Verification

`yarn typecheck`, `yarn lint`, `yarn build`, `yarn test`, and a server boot from this checkout.
