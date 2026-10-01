# refactor: server-routes duplicate code (#2822)

The "server-routes" cluster of the jscpd alerts tracked in #2822.

## What is extracted

- `server/config/on-disk-entry.ts` (new)
  - `refuseOnProblem(build)` — the `refuse` half every one-entry change repeated:
    the build's `problem`, or null. Used by the three agent-entry add routes and by both
    theme routes that can refuse (`duplicate`, `colors`).
  - `appendOnDisk(key, build)` — `refuse` plus the `update` that appends the built entry to
    `customAgents` / `accounts` / `providers`, or hands the on-disk list back unchanged.
    `answer` stays at each route, because `accounts/add` also runs `onAccountsChanged`.
- `server/files/files-tree-routes.ts` — `existingEntryFor` folds "the entry the request names"
  and "it is not there: 404" together for `rename` and `trash`. Order is unchanged: gone cwd
  (404), escape (403), missing (404).

## Why it preserves behaviour

- The update returns the on-disk array itself (same reference) when the build refuses, exactly as
  the inline `base.<key>` did.
- `refuseOnProblem` reads `problem ?? null` rather than `"problem" in built ? … : null`. The two
  differ only for an outcome carrying `problem: undefined`, which no builder returns and the
  `Refusable` type rules out.
- Checked by running origin/main's code beside the new code over generated inputs (route
  requests over real temp trees for the file routes; real builders over grown configs for the
  config halves). The generator and property live on in `test/server/config/on-disk-entry.spec.ts`.

## Declined

Nothing in this cluster. The `remove` routes share a shape too but are not in the alert list
and were left alone.
