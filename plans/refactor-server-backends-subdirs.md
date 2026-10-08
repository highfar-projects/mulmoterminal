# refactor: group server/backends into subdirectories (#2952)

Third of a series after `server/agents` (#2944) and `server/config` (#2946): `backends` -> `session` -> `infra`
next, one directory per PR. Same method and constraint: files are moved with `git mv`, never renamed or
edited; only import specifiers and path mentions change.

## Layout

- `collections/` — collection routes, action index, watchers, staging of collection skills, custom views
  and the view token / rate-limit / thumbnail helpers they serve, shared collections.
- `skills/` — the skill catalog and the skills.sh client.
- `calendar/` — calendar push and refresh, and the Google routes they sit on.
- `feeds/` — the feeds routes and their worker.
- `scheduler/` — the scheduler, its adapter and state seed, scheduled runs, system tasks, worklog.
- `files/` — file serving, the `/files` page, path and byte-range helpers, open-path, stories root.
- `plugins/` — backends of the document plugins: accounting, artifacts, deck list, html, markdown,
  mulmoscript, shapescript, wiki.
- `media/` — image generation, translation, whisper and audio admission.
- `sharedApp/` (already existed) — also takes `sharedAppPreviewRoutes`.
- Root keeps host-wide leaves: `boot-backends`, `hostLogger`, `notifier`, `shortcuts`, `workspaceSetup`.

`test/server/backends/` follows the same split for every spec named after one of the moved modules, and
`sharedApp*` specs go to `test/server/backends/sharedApp/`. Specs that exercise the shared-app internals
under other names (`publicForm`, `headless*`, `appView*`, ...) stay where they are: grouping them is a
separate judgement about `sharedApp/`, not part of this move.

## Verification

`yarn typecheck`, `yarn lint`, `yarn build`, `yarn test`, and a server boot from this checkout.
