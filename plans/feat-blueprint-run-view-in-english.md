# The build list and the run view in English (#2634)

A build stores its step titles and descriptions when it starts, in the packs' Japanese, so after #2838 and #2843 the
new-build form was English while the list (what each build makes, its current step) and the run view (every step)
stayed Japanese.

- The stored record does not change. When the list or a build is read, the packs' overlays are laid over the stored
  steps with the same rule as the form: the words written for the build's base first (`<id>@<base>`), the base being
  the base pack's folder name. `localizedRunSteps` and `overlayReader` (one read per pack per request) are in
  `server/blueprint/packLocales.ts`.
- `GET /api/blueprints/runs?lang=` passes the language to `executor.list`, which localizes the usecase title and each
  build's steps before summarizing; `GET /api/blueprints/runs/:id?lang=` localizes the view's steps. The UI sends the
  screen's language with both.
- Found on the real server, not by the specs: the route's executor is wrapped by `lockedExecutor` in `wiring.ts`, whose
  `list: () => executor.list()` dropped the argument — a wrapper naming fewer parameters still type-checks. Every read
  in the wrapper now forwards its arguments as given, and a spec pins it.
